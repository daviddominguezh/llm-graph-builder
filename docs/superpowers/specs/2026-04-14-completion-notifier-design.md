# CompletionNotifier: Async Composition with Synchronous HTTP Response

## Goal

When a production HTTP request (`POST /api/agents/:slug/:version`) triggers a workflow that dispatches a child agent, the HTTP response must wait for the entire composition chain to complete and return the final `text`. The internal processing remains fully async and event-driven (workers, queues, atomic DB claims). Only the HTTP response timing changes.

## Architecture

The system uses a **synchronous facade over an async pipeline**. The HTTP handler subscribes to a Redis Pub/Sub channel before dispatching, then blocks until the resume worker publishes a completion notification. Workers, stack management, and DB persistence are unchanged.

### Notification Strategy: Pub/Sub + Durable Key

Redis Pub/Sub is fire-and-forget — if no subscriber is listening, the message is lost. To guarantee delivery, the notifier uses a **dual-write pattern**:

1. **`SET completion_result:{execId} <payload> NX EX 300`** — durable key with `NX` (set-if-not-exists), persists 5 minutes. First notification wins — prevents double-notification conflicts.
2. **`PUBLISH completion:{execId} <payload>`** — instant notification for the fast path.

The durable key TTL is configurable via `COMPLETION_RESULT_TTL_SECONDS` (default 300). Must be >= `COMPLETION_TIMEOUT_MS / 1000` + a polling buffer.

The waiter uses a **tiered fallback**:

1. **Pub/Sub** (primary) — instant, zero latency. Handles 99%+ of cases.
2. **Durable key check** — single `GET` after Pub/Sub timeout. Catches missed Pub/Sub (disconnection, blip).
3. **Polling loop** (fallback) — polls the key every 2s for a grace period. Only activates if Pub/Sub AND the immediate key check both missed. Handles the edge case where notification and check race.
4. **DB read** (last resort) — reads `agent_executions` status + final text. Only if Redis is entirely unavailable.

```
Caller                HTTP Handler              Workers
  |                       |                        |
  |--- POST /execute ---->|                        |
  |                       |-- pre-generate execId  |
  |                       |-- await subscribe to   |
  |                       |   completion:{execId}  |
  |                       |-- executeAgentCore()   |
  |                       |   (dispatch happens    |
  |                       |    internally)         |
  |                       |                        |
  |                       |   [blocked on Pub/Sub] |-- childWorker picks up
  |                       |                        |-- invokes edge function
  |                       |                        |-- child finishes
  |                       |                        |-- creates pending_resume
  |                       |                        |
  |                       |                        |-- resumeWorker picks up
  |                       |                        |-- reinvokes parent
  |                       |                        |-- parent completes
  |                       |                        |-- SET NX key + PUBLISH
  |                       |                        |
  |                       |   [notified!]          |
  |<-- { text: "..." } ---|                        |
```

### Race Condition Safety

`executeAgentCore()` calls `dispatchIfNeeded()` internally before returning. The handler cannot subscribe after the function returns — the child may already be done. Solution: **pre-generate the executionId** and pass it into `executeAgentCore()`. The handler subscribes using this ID before calling the function.

**The subscribe must be `await`ed** — the `SUBSCRIBE` command is async, and between calling `subscribe()` and Redis acknowledging it, messages can be lost. The handler must wait for subscription confirmation before calling `executeAgentCore`.

```
1. execId = crypto.randomUUID()
2. await subscribe(completion:{execId})  ← await confirmation before proceeding
3. output = executeAgentCore(execId)     ← dispatch happens inside
4. if no dispatch → unsubscribe, return normally
5. if dispatch → wait for notification
```

This requires a small refactor: `executeAgentCore` accepts an optional `executionId` parameter. If provided, it uses it instead of generating one internally. The `setupExecution` function passes it to `persistPreExecution`.

## Interface

```typescript
interface ExecutionResult {
  status: 'completed' | 'error';
  text: string;
  executionId: string;
}

interface CompletionNotifier {
  waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionResult | null>;
  notifyCompletion(executionId: string, result: ExecutionResult): Promise<void>;
  shutdown(): void;
}
```

- `waitForCompletion` — awaits subscribe confirmation, then blocks until notification, key check, or timeout. Returns `null` only if all fallbacks exhausted.
- `notifyCompletion` — dual-writes: `SET NX` durable key + `PUBLISH` (retry with jitter). First call wins via `NX`.
- `shutdown` — resolves all active Promises with a shutdown sentinel (HTTP handler returns 503 immediately, no fallback storm), disconnects connections.

## Implementations

### RedisCompletionNotifier (production)

Uses ioredis via Redis Cloud.

**Single shared subscriber connection.** The `RedisCompletionNotifier` maintains ONE ioredis connection in subscribe mode per instance. Channels are added/removed dynamically with `subscribe`/`unsubscribe` on this single connection. Incoming messages are routed to the correct waiting Promise via an in-memory `Map<executionId, resolver>`.

**Important:** This is a NEW subscriber connection inside `RedisCompletionNotifier`, NOT the existing `subscribeToChannel` function from `redisCloud.ts`. The existing function creates a new connection per call and must NOT be used for completion notifications.

```typescript
class RedisCompletionNotifier {
  private subscriber: Redis;            // single shared connection, subscribe mode
  private publisher: Redis;             // shared connection for SET + PUBLISH
  private waiters: Map<string, {
    resolve: (result: ExecutionResult) => void;
    timer: NodeJS.Timeout;
  }>;

  async waitForCompletion(execId, timeoutMs) {
    // 1. Register resolver in waiters map
    // 2. await subscriber.subscribe(`completion:${execId}`)  ← must await
    // 3. Return Promise that resolves when:
    //    a. on('message') fires for this execId → resolve, cleanup
    //    b. timeout expires → tier 2-3-4 fallback, cleanup
    // 4. Cleanup (in finally block, unconditional):
    //    - Remove from waiters map
    //    - Unsubscribe from channel
  }

  async notifyCompletion(execId, result) {
    // 1. SET completion_result:{execId} <payload> NX EX <ttl>  (first wins)
    // 2. PUBLISH completion:{execId} <payload>
    //    - Retry 3x with jitter: delay = baseDelay * 2^attempt + random(0, baseDelay)
    //    - Base delay: 100ms → retries at ~100-200ms, ~200-400ms, ~400-800ms
    //    - If all retries fail, the NX key is still set — waiter finds it via fallback
  }
}
```

**Connection count:** 2 per instance (1 shared subscriber + 1 shared publisher) regardless of concurrent requests. With 10 instances: 20 connections total.

**Subscribe errors:** If `subscriber.subscribe()` rejects (Redis down), `waitForCompletion` rejects immediately. The HTTP handler catches this and falls back to DB polling without waiting 120 seconds.

**Circuit breaker:** Uses a **sliding window** (3 failures in the last 10 requests) rather than consecutive failures. This is more robust against transient blips. When circuit opens, all requests skip Pub/Sub and use DB polling directly. Circuit resets after 30-second cooldown.

**Waiter cleanup:** All exit paths (success, timeout, error, shutdown) use a `finally` block that unconditionally removes the entry from the waiters map and unsubscribes the channel.

**At high concurrency (500+ waiters):** If `COMPLETION_MAX_CONCURRENT` is increased significantly, evaluate `PSUBSCRIBE completion:*` with in-memory filtering as an alternative to per-channel subscriptions.

### InProcessCompletionNotifier (dev/test)

Uses Node `EventEmitter`. Same interface. **Guarded:** constructor throws if `NODE_ENV` is not `development` or `test`. Prevents silent failure in staging or production.

## Integration Points

### HTTP Handler (`executeHandler.ts`)

```
1. execId = crypto.randomUUID()
2. waitPromise = notifier.waitForCompletion(execId, timeoutMs)  ← subscribes, awaits confirmation
3. output = executeAgentCore({ ...params, executionId: execId })
4. if no dispatch:
   a. cancel waitPromise (unsubscribe)
   b. return response normally
5. if dispatch detected:
   a. result = await waitPromise
   b. if result: return { text: result.text, ... }
   c. if null: return { text: '', executionId: execId }
```

**Backpressure:** A bounded semaphore limits concurrent waiting requests (default: 100 per instance). When at capacity, new dispatch-producing requests receive HTTP 503 with the `executionId`. The caller retrieves the result later via the polling endpoint.

### Polling Endpoint (`GET /api/executions/:id/result`)

For callers that receive 503 (semaphore full) or timeout (composition still running). Returns:

- `200 { status: 'completed', text: '...', executionId: '...' }` — if complete
- `200 { status: 'running', executionId: '...' }` — if still processing
- `200 { status: 'error', text: 'error message', executionId: '...' }` — if failed
- `404` — execution not found

Implementation: reads `agent_executions.status`. If `completed`, reads the final assistant message from `agent_execution_messages` ordered by `created_at DESC LIMIT 1` where `role = 'assistant'` and `execution_id` matches.

### Resume Parent Handler (`resumeParentHandler.ts`)

After `reinvokeParent()`:

1. If output has **no new dispatch** (chain complete):
   - Call `notifier.notifyCompletion(rootExecutionId, { status: 'completed', text, executionId: rootExecutionId })`
2. If output has another dispatch (nested grandchild): don't notify — chain continues.
3. **On transient error** (catch block): do NOT notify. Return 500 to the worker so it retries. The retry mechanism may recover.

Error notification happens only on **permanent failure** — see "Worker failure" section below.

### Execute Core (`executeCore.ts`)

Small refactor: `ExecuteCoreInput` gains an optional `executionId?: string` field. If provided, `persistPreExecution` uses it as the execution record ID instead of generating a new UUID. This enables subscribe-before-dispatch.

### Server Initialization (`index.ts`)

- Instantiate `RedisCompletionNotifier` (production) or `InProcessCompletionNotifier` (dev/test).
- Pass notifier to route handlers and workers via dependency injection.
- Add `SIGTERM`/`SIGINT` handlers that:
  1. Call `notifier.shutdown()` — resolves all waiters with shutdown sentinel.
  2. Workers complete current batch, then stop (no new `setTimeout`).
  3. HTTP server drains active connections.

## Nested Composition (N-depth) and `rootExecutionId`

For N-depth nesting, the HTTP handler waits on the **root** execution ID. The notifier must always publish to that channel when the chain terminates, regardless of depth.

**Problem:** `resumeParentHandler` only knows `parentExecutionId` — not the root. For 3+ levels, the parent's parent is the root. The handler would notify on the wrong channel.

**Solution:** Thread `rootExecutionId` through the composition stack.

### How `rootExecutionId` is determined

The HTTP handler is the only entity that knows an execution is a root — it pre-generates the ID. It passes `rootExecutionId` as a new field in `ExecuteCoreInput`. When `handleDispatchResult` is called:

1. It receives `rootExecutionId` from `ExecuteCoreInput`.
2. It stores `root_execution_id` in the `agent_stack_entries` row.
3. When creating `pending_child_executions`, it includes `root_execution_id`.
4. When `childExecutionWorker` creates a `pending_resume` (via `createResumeFromFinish`), it copies `root_execution_id` from the stack entry.
5. `resumeWorker` passes `root_execution_id` in the POST body to `/internal/resume-parent`.
6. `resumeParentHandler` reads it and uses it for `notifyCompletion`.

For mid-level dispatches (child dispatches grandchild), `executeAgentCore` is called by `childExecutionWorker` without a pre-generated ID. The `rootExecutionId` is inherited from the parent's stack entry, not from the input.

### Interface changes required

| Interface | Change |
|---|---|
| `ExecuteCoreInput` | Add `rootExecutionId?: string` |
| `DispatchHandlerParams` | Add `rootExecutionId: string` |
| `PushStackEntryParams` (stackQueries) | Add `rootExecutionId: string` |
| `PendingChildExecution` (childExecutionQueries) | Add `root_execution_id: string` |
| `PendingResume` (resumeQueries) | Add `root_execution_id: string` |
| `ResumeParentBodySchema` | Add `rootExecutionId: string` |
| Resume worker POST body | Add `rootExecutionId` field |

```
HTTP handler waits on completion:{rootExecId}
  └─ child dispatched (stack: root_execution_id = rootExecId)
       └─ grandchild dispatched (stack: root_execution_id = rootExecId, inherited)
            └─ grandchild finishes → resume child
                 └─ child finishes → resume parent
                      └─ parent completes → notifyCompletion(rootExecId)
```

## Timeout and Fallback

Default timeout: 120 seconds, configurable via `COMPLETION_TIMEOUT_MS`.

Tiered fallback (each tier only activates if the previous tier fails):

| Tier | Trigger | Mechanism | Latency |
|---|---|---|---|
| 1. Pub/Sub | Primary | Shared subscriber, `on('message')` routed via waiters map | Instant (~1ms) |
| 2. Durable key | Pub/Sub timeout | `GET completion_result:{execId}` | Single read |
| 3. Polling | Key not found | `GET` every 2s for `POLLING_GRACE_MS` (10s) | 2-10s |
| 4. DB read | Polling exhausted | `SELECT status FROM agent_executions WHERE id = $1` + final assistant message if completed | Single query |

DB fallback query: `SELECT status FROM agent_executions WHERE id = $1`. If `completed`, then: `SELECT content FROM agent_execution_messages WHERE execution_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`. If `failed`, return error. If `suspended` or `running`, return null (still processing).

If all tiers return null, respond with `{ text: '', executionId }` — the caller uses the polling endpoint.

## Error Handling and Failure Modes

### Worker permanent failure (child or resume hits MAX_ATTEMPTS)

When `childExecutionWorker` or `resumeWorker` marks a child/resume as `failed` after exhausting retries:

1. Read `root_execution_id` from the stack entry or pending row.
2. Mark the **root** parent execution as `failed`.
3. Call `notifier.notifyCompletion(rootExecutionId, { status: 'error', ... })`.
4. The HTTP handler receives the error immediately instead of waiting 120s.

Error notification happens ONLY here — on permanent failure. Transient errors in `resumeParentHandler` return 500 to the worker, which retries. This prevents double-notification conflicts where an error notification is followed by a success after retry.

### `notifyCompletion` idempotency

The durable key uses `SET NX` (set-if-not-exists). First notification wins. If a retry of a failed child eventually succeeds and tries to notify with `completed`, but an earlier `error` notification already set the key, the key keeps the first value. The `PUBLISH` may deliver both, but the waiter's resolver is called only once (first message wins, resolver removed from map).

### Redis unavailable

Circuit breaker (sliding window: 3 failures in 10 requests) activates. All subsequent requests skip Pub/Sub and use DB polling directly. Circuit resets after 30-second cooldown.

### Publish failure

`notifyCompletion` retries PUBLISH 3 times with **jittered exponential backoff**: `delay = baseDelay * 2^attempt + random(0, baseDelay)`. Base delay: 100ms. If all retries fail, the durable `NX` key was already written — the waiter finds it via fallback.

## Worker Improvements

### Concurrency guard

Replace `setInterval` with `setTimeout`-after-completion loop in both `childExecutionWorker` and `resumeWorker`. The loop uses `try/catch/finally` to ensure the next poll is always scheduled, even on unhandled errors:

```typescript
async function pollLoop(): Promise<void> {
  try {
    await processBatch();
  } catch (err) {
    log(`batch error: ${String(err)}`);
  } finally {
    setTimeout(() => void pollLoop(), POLL_INTERVAL_MS);
  }
}
```

This prevents both overlapping batches AND silent worker death.

## Observability

Emit structured log entries (replaceable with StatsD/Prometheus later):

| Metric | When |
|---|---|
| `completion.wait.started` | HTTP handler begins waiting |
| `completion.wait.resolved` | Notification received (tag: `source=pubsub\|key\|polling\|db`) |
| `completion.wait.timeout` | All tiers exhausted |
| `completion.wait.duration_ms` | Time from subscribe to resolution |
| `completion.notify.sent` | notifyCompletion called |
| `completion.notify.publish_retry` | PUBLISH retry triggered |
| `completion.circuit.open` | Circuit breaker activated |
| `completion.circuit.close` | Circuit breaker reset |
| `completion.semaphore.active` | Current number of waiting requests (gauge) |
| `composition.child.queue_wait_ms` | Time child sits in pending before claim |
| `composition.resume.queue_wait_ms` | Time resume sits in pending before claim |
| `composition.total_duration_ms` | End-to-end composition time |

## Connection Management and Shutdown

The `RedisCompletionNotifier` uses exactly 2 Redis connections per instance:
- 1 shared subscriber (managed internally, channels added/removed dynamically)
- 1 shared publisher (from `getRedisCloud()` singleton)

On `SIGTERM`/`SIGINT`:

1. `notifier.shutdown()` is called.
2. All active `waitForCompletion` Promises are resolved with a **shutdown sentinel** (`{ status: 'error', text: 'Server shutting down' }`). HTTP handlers return 503 immediately — no fallback storm.
3. Shared subscriber is unsubscribed from all channels and disconnected.
4. Workers finish current batch via `finally` block, then stop scheduling.

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `REDIS_URL` | (required) | Redis Cloud connection string |
| `COMPLETION_TIMEOUT_MS` | `120000` | Max wait for composition completion |
| `COMPLETION_MAX_CONCURRENT` | `100` | Max concurrent waiting requests per instance |
| `COMPLETION_POLLING_GRACE_MS` | `10000` | Polling duration after Pub/Sub timeout |
| `COMPLETION_RESULT_TTL_SECONDS` | `300` | TTL for durable completion key |
| `COMPLETION_CIRCUIT_THRESHOLD` | `3` | Failures in sliding window before circuit opens |
| `COMPLETION_CIRCUIT_WINDOW` | `10` | Sliding window size for circuit breaker |
| `COMPLETION_CIRCUIT_COOLDOWN_MS` | `30000` | Cooldown before circuit resets |

## Files

### New Files

| File | Purpose |
|---|---|
| `src/notifications/completionNotifier.ts` | Interface, `ExecutionResult` type, config constants |
| `src/notifications/redisCompletionNotifier.ts` | Shared subscriber + durable key + circuit breaker |
| `src/notifications/inProcessCompletionNotifier.ts` | EventEmitter for dev/test (guards against non-dev envs) |
| `src/routes/execute/executionResultRoute.ts` | `GET /api/executions/:id/result` polling endpoint |

### Modified Files

| File | Change |
|---|---|
| `src/routes/execute/executeHandler.ts` | Pre-generate execId, await subscribe, wait/fallback, semaphore |
| `src/routes/execute/executeCore.ts` | Accept optional `executionId` and `rootExecutionId` |
| `src/routes/execute/executeCoreDispatch.ts` | Pass `rootExecutionId` to dispatch handler |
| `src/routes/execute/executeDispatchHandler.ts` | Store `root_execution_id` in stack and pending child |
| `src/routes/internal/resumeParentHandler.ts` | Use `rootExecutionId` for notification on chain completion |
| `src/workers/childExecutionWorker.ts` | setTimeout loop, propagate `rootExecutionId`, notify on permanent failure |
| `src/workers/resumeWorker.ts` | setTimeout loop, propagate `rootExecutionId`, notify on permanent failure |
| `src/index.ts` | Instantiate notifier, SIGTERM/SIGINT handlers |

### DB Schema Changes

| Table | Change |
|---|---|
| `agent_stack_entries` | Add `root_execution_id UUID NOT NULL` column |
| `pending_child_executions` | Add `root_execution_id UUID NOT NULL` column |
| `pending_resumes` | Add `root_execution_id UUID NOT NULL` column |

Migration: new columns default to `execution_id` (self-referencing) for existing rows.

## HTTP Response Change

The response shape is unchanged. The `text` field is populated instead of empty:

**Before (dispatch detected):**
```json
{ "appType": "workflow", "text": "", "currentNodeId": "invoke_node", "toolCalls": [...] }
```

**After (composition completes within timeout):**
```json
{ "appType": "workflow", "text": "Final output from entire chain", "currentNodeId": "terminal_node", "toolCalls": [...], "durationMs": 15230 }
```

**After (timeout, still processing):**
```json
{ "appType": "workflow", "text": "", "executionId": "abc-123", "toolCalls": [...] }
```

**After (composition failed):**
```json
{ "appType": "workflow", "text": "", "executionId": "abc-123", "error": "Child agent failed after max retries", "toolCalls": [...] }
```

## Known Scaling Constraints

- **Resume worker localhost loopback:** `resumeWorker` calls `POST http://127.0.0.1:{PORT}/internal/resume-parent`. Resume computation always happens on the polling instance, not distributed. Acceptable at 10 instances. At 100+, consider a direct function call instead of HTTP loopback.
- **Per-instance Pub/Sub fan-out:** Every instance's shared subscriber receives every `PUBLISH` on its subscribed channels. With 10 instances waiting on different executions, each `PUBLISH` is received by only the instance that subscribed to that channel. No fan-out waste.

## Non-Goals

- Streaming SSE for production execution (future work).
- Changing worker polling intervals or batch sizes.
- Replacing Upstash for cache operations (already split in Redis migration).
