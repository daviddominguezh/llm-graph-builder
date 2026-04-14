# CompletionNotifier: Async Composition with Synchronous HTTP Response

## Goal

When a production HTTP request (`POST /api/agents/:slug/:version`) triggers a workflow that dispatches a child agent, the HTTP response must wait for the entire composition chain to complete and return the final `text`. The internal processing remains fully async and event-driven (workers, queues, atomic DB claims). Only the HTTP response timing changes.

## Architecture

The system uses a **synchronous facade over an async pipeline**. The HTTP handler subscribes to a Redis Pub/Sub channel before dispatching, then blocks until the resume worker publishes a completion notification. Workers, stack management, and DB persistence are unchanged.

### Notification Strategy: Pub/Sub + Durable Key

Redis Pub/Sub is fire-and-forget — if no subscriber is listening, the message is lost. To guarantee delivery, the notifier uses a **dual-write pattern**:

1. **`SET completion_result:{execId} <payload> EX 300`** — durable key, persists 5 minutes.
2. **`PUBLISH completion:{execId} <payload>`** — instant notification for the fast path.

The waiter uses a **tiered fallback**:

1. **Pub/Sub** (primary) — instant, zero latency. Handles 99%+ of cases.
2. **Durable key check** — single `GET` after Pub/Sub timeout. Catches missed Pub/Sub (disconnection, blip).
3. **Polling loop** (fallback) — polls the key every 2s for a grace period. Only activates if Pub/Sub AND the immediate key check both missed. Handles the edge case where notification and check race.
4. **DB read** (last resort) — reads `agent_executions` status. Only if Redis is entirely unavailable.

```
Caller                HTTP Handler              Workers
  |                       |                        |
  |--- POST /execute ---->|                        |
  |                       |-- pre-generate execId  |
  |                       |-- subscribe to         |
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
  |                       |                        |-- SET key + PUBLISH
  |                       |                        |
  |                       |   [notified!]          |
  |<-- { text: "..." } ---|                        |
```

### Race Condition Safety

`executeAgentCore()` calls `dispatchIfNeeded()` internally before returning. The handler cannot subscribe after the function returns — the child may already be done. Solution: **pre-generate the executionId** and pass it into `executeAgentCore()`. The handler subscribes using this ID before calling the function.

```
1. execId = generateExecutionId()
2. subscribe(completion:{execId})       ← before any dispatch
3. output = executeAgentCore(execId)    ← dispatch happens inside
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

- `waitForCompletion` — subscribes to channel, blocks until notification, key check, or timeout. Returns `null` only if all fallbacks exhausted.
- `notifyCompletion` — dual-writes: SET durable key + PUBLISH. Retries PUBLISH up to 3 times on failure. If all retries fail, the durable key still ensures delivery.
- `shutdown` — disconnects all tracked subscriber connections and the shared publisher.

## Implementations

### RedisCompletionNotifier (production)

Uses ioredis via Redis Cloud.

**Single shared subscriber:** One ioredis subscriber connection per instance, subscribed to channels dynamically. Incoming messages are routed to the correct waiting Promise via an in-memory `Map<executionId, resolver>`.

```typescript
class RedisCompletionNotifier {
  private subscriber: Redis;                          // single shared connection
  private waiters: Map<string, (result: ExecutionResult) => void>;
  
  waitForCompletion(execId, timeoutMs) {
    // 1. Register resolver in waiters map
    // 2. Subscribe to completion:{execId} on shared subscriber
    // 3. Wait for resolver to be called OR timeout
    // 4. On timeout: GET completion_result:{execId} (durable key)
    // 5. If found: return result
    // 6. If not found: poll GET every 2s for POLLING_GRACE_MS (10s)
    // 7. If still not found: DB fallback read
    // 8. Cleanup: remove from waiters map, unsubscribe channel
  }
  
  notifyCompletion(execId, result) {
    // 1. SET completion_result:{execId} <payload> EX 300
    // 2. PUBLISH completion:{execId} <payload> (retry 3x)
  }
}
```

**Connection count:** 2 per instance (1 shared subscriber + 1 shared publisher) regardless of concurrent requests. With 10 instances: 20 connections total.

**Subscribe errors:** If `subscriber.subscribe()` fails (Redis down), the Promise rejects immediately. The HTTP handler catches this and falls back to DB polling without waiting 120 seconds.

**Circuit breaker:** After 3 consecutive Redis failures, skip Pub/Sub entirely and go straight to DB polling for a 30-second cooldown period. Prevents cascading failures when Redis is down.

### InProcessCompletionNotifier (dev/test)

Uses Node `EventEmitter`. Same interface. **Guarded against production use:** constructor throws if `NODE_ENV === 'production'`.

## Integration Points

### HTTP Handler (`executeHandler.ts`)

```
1. execId = crypto.randomUUID()
2. subscribe: waitPromise = notifier.waitForCompletion(execId, timeoutMs)
3. output = executeAgentCore({ ...params, executionId: execId })
4. if no dispatch:
   a. cancel waitPromise (unsubscribe)
   b. return response normally
5. if dispatch detected:
   a. result = await waitPromise
   b. if result: return { text: result.text, ... }
   c. if null: return { text: '', executionId: execId }
```

**Backpressure:** A bounded semaphore limits concurrent waiting requests (default: 100 per instance). When at capacity, new dispatch-producing requests receive HTTP 503 with the `executionId` for async polling. This prevents memory exhaustion and connection starvation.

### Resume Parent Handler (`resumeParentHandler.ts`)

After `reinvokeParent()`:

1. If output has **no new dispatch** (chain complete):
   - Call `notifier.notifyCompletion(rootExecutionId, { status: 'completed', text, executionId: rootExecutionId })`
2. If output has another dispatch (nested grandchild): don't notify — chain continues.
3. **On error** (catch block): call `notifier.notifyCompletion(rootExecutionId, { status: 'error', text: errorMessage, executionId: rootExecutionId })` and mark the parent execution as `failed`.

### Execute Core (`executeCore.ts`)

Small refactor: `ExecuteCoreInput` gains an optional `executionId?: string` field. If provided, `persistPreExecution` uses it as the execution record ID instead of generating a new UUID. This enables subscribe-before-dispatch.

### Server Initialization (`index.ts`)

- Instantiate `RedisCompletionNotifier` (production) or `InProcessCompletionNotifier` (dev/test).
- Pass notifier to route handlers via dependency injection.
- Add `SIGTERM`/`SIGINT` handlers that call `notifier.shutdown()` and drain active requests.

## Nested Composition (N-depth) and `rootExecutionId`

For N-depth nesting, the HTTP handler waits on the **root** execution ID. The notifier must always publish to that channel when the chain terminates, regardless of depth.

**Problem:** `resumeParentHandler` only knows `parentExecutionId` — not the root. For 3+ levels, the parent's parent is the root. The handler would notify on the wrong channel.

**Solution:** Thread `rootExecutionId` through the composition stack:

1. `agent_stack_entries` gains a `root_execution_id` column.
2. When `executeDispatchHandler` pushes a stack entry, it sets `root_execution_id`:
   - If the parent has no parent (it IS the root): `root_execution_id = parentExecutionId`
   - If the parent has a parent (mid-level): inherit `root_execution_id` from the parent's stack entry
3. `pending_resumes` carries `root_execution_id` from the stack entry.
4. `resumeParentHandler` reads `root_execution_id` from the claimed resume and uses it for `notifyCompletion`.

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
| 1. Pub/Sub | Primary | `SUBSCRIBE completion:{execId}` | Instant (~1ms) |
| 2. Durable key | Pub/Sub timeout | `GET completion_result:{execId}` | Single read |
| 3. Polling | Key not found | `GET` every 2s for 10s grace | 2-10s |
| 4. DB read | Polling exhausted | Read `agent_executions` + `agent_execution_messages` | Single query |

If all tiers fail, return `{ text: '', executionId }` for the caller to poll via a separate endpoint.

## Error Handling and Failure Modes

### Worker failure (child or resume hits MAX_ATTEMPTS)

When `childExecutionWorker` or `resumeWorker` marks a child/resume as `failed`:
1. Mark the **root** parent execution as `failed`.
2. Call `notifier.notifyCompletion(rootExecutionId, { status: 'error', ... })`.
3. The HTTP handler receives the error immediately instead of waiting 120s.

### `reinvokeParent` throws

The catch block in `handleResumeParent` must:
1. Call `notifyCompletion(rootExecutionId, { status: 'error', text: errorMessage, ... })`.
2. Update `agent_executions.status` to `failed` for the parent.

### Redis unavailable

Circuit breaker activates after 3 consecutive failures. All subsequent requests skip Pub/Sub and use DB polling directly. Circuit resets after 30-second cooldown.

### Publish failure

`notifyCompletion` retries PUBLISH 3 times with exponential backoff (100ms, 200ms, 400ms). If all retries fail, the durable key (`SET`) was already written — the waiter will find it via the key check or polling.

## Worker Improvements

### Concurrency guard

Replace `setInterval` with `setTimeout`-after-completion loop in both `childExecutionWorker` and `resumeWorker`. This prevents overlapping batches when LLM calls take longer than the poll interval.

```typescript
// Before (overlapping batches):
setInterval(() => processBatch(), POLL_INTERVAL_MS);

// After (sequential, no overlap):
async function pollLoop(): Promise<void> {
  await processBatch();
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}
```

### Failed chain notification

When a child/resume is marked `failed` after MAX_ATTEMPTS:
1. Walk the stack to find `root_execution_id`.
2. Call `notifyCompletion(rootExecutionId, { status: 'error', ... })`.
3. Mark root execution as `failed`.

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

## Connection Management and Shutdown

**Active connections tracked:** The `RedisCompletionNotifier` maintains a `Set` of all subscriber connections. On shutdown:

1. `SIGTERM`/`SIGINT` handler calls `notifier.shutdown()`.
2. All active `waitForCompletion` Promises are resolved with `null`.
3. All subscriber connections are unsubscribed and disconnected.
4. Workers complete their current batch, then stop.

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `REDIS_URL` | (required) | Redis Cloud connection string |
| `COMPLETION_TIMEOUT_MS` | `120000` | Max wait for composition completion |
| `COMPLETION_MAX_CONCURRENT` | `100` | Max concurrent waiting requests per instance |
| `COMPLETION_POLLING_GRACE_MS` | `10000` | Polling duration after Pub/Sub timeout |
| `COMPLETION_CIRCUIT_THRESHOLD` | `3` | Consecutive failures before circuit opens |
| `COMPLETION_CIRCUIT_COOLDOWN_MS` | `30000` | Cooldown before circuit resets |

## Files

### New Files

| File | Purpose |
|---|---|
| `src/notifications/completionNotifier.ts` | Interface, `ExecutionResult` type, config constants |
| `src/notifications/redisCompletionNotifier.ts` | Redis Pub/Sub + durable key implementation |
| `src/notifications/inProcessCompletionNotifier.ts` | EventEmitter for dev/test (guards against production) |

### Modified Files

| File | Change |
|---|---|
| `src/routes/execute/executeHandler.ts` | Pre-generate execId, subscribe before execute, wait/fallback |
| `src/routes/execute/executeCore.ts` | Accept optional `executionId` in `ExecuteCoreInput` |
| `src/routes/internal/resumeParentHandler.ts` | Notify on completion or error, use `rootExecutionId` |
| `src/workers/childExecutionWorker.ts` | setTimeout loop (no overlap), notify on permanent failure |
| `src/workers/resumeWorker.ts` | setTimeout loop (no overlap), notify on permanent failure |
| `src/index.ts` | Instantiate notifier, SIGTERM/SIGINT handlers, pass to routes |

### DB Schema Changes

| Table | Change |
|---|---|
| `agent_stack_entries` | Add `root_execution_id UUID NOT NULL` column |
| `pending_resumes` | Add `root_execution_id UUID NOT NULL` column |

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

## Non-Goals

- Streaming SSE for production execution (future work).
- Changing worker polling intervals or batch sizes.
- Replacing Upstash for cache operations (already split in Redis migration).
