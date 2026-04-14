# CompletionNotifier: Async Composition with Synchronous HTTP Response

## Goal

When a production HTTP request (`POST /api/agents/:slug/:version`) triggers a workflow that dispatches a child agent, the HTTP response must wait for the entire composition chain to complete and return the final `text`. The internal processing remains fully async and event-driven (workers, queues, atomic DB claims). Only the HTTP response timing changes.

## Architecture

The system uses a **synchronous facade over an async pipeline**. The HTTP handler subscribes to a Redis Pub/Sub channel before dispatching, then blocks until the resume worker publishes a completion notification. Workers, stack management, and DB persistence are unchanged.

```
Caller                HTTP Handler              Workers
  |                       |                        |
  |--- POST /execute ---->|                        |
  |                       |-- executeAgentCore()   |
  |                       |   (hits dispatch)      |
  |                       |                        |
  |                       |-- subscribe to         |
  |                       |   completion:{execId}  |
  |                       |-- dispatchIfNeeded()   |
  |                       |   (suspend parent,     |
  |                       |    create pending)     |
  |                       |                        |
  |                       |   [blocked...]         |-- childWorker picks up
  |                       |                        |-- invokes edge function
  |                       |                        |-- child finishes
  |                       |                        |-- creates pending_resume
  |                       |                        |
  |                       |                        |-- resumeWorker picks up
  |                       |                        |-- reinvokes parent
  |                       |                        |-- parent completes
  |                       |                        |-- notifyCompletion()
  |                       |                        |
  |                       |   [notified!]          |
  |<-- { text: "..." } ---|                        |
```

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

- `waitForCompletion` subscribes to `completion:{executionId}`, blocks until notification or timeout. Returns `null` on timeout.
- `notifyCompletion` publishes to `completion:{executionId}` when root execution finishes.
- `shutdown` disconnects and cleans up.

## Implementations

### RedisCompletionNotifier (production)

Uses ioredis via Redis Cloud (TCP Pub/Sub).

- **Channel:** `completion:{executionId}` -- unique per execution, no cross-talk.
- **Payload:** `{"status":"completed","text":"...","executionId":"abc-123"}` -- carries result directly, avoids DB round-trip.
- **Subscribe connection:** `waitForCompletion` creates a dedicated ioredis subscriber connection (required by Redis -- subscribe mode is exclusive). Cleaned up after notification or timeout.
- **Publish connection:** `notifyCompletion` uses the shared singleton from `redisCloud.ts`.
- **Multi-instance:** Works naturally across 10 backend instances. Instance A subscribes, instance B publishes, Redis routes.

### InProcessCompletionNotifier (dev/test)

Uses Node `EventEmitter`. Single-instance only. Same interface, no Redis dependency. Useful for unit tests and local development without Redis.

## Integration Points

### HTTP Handler (`executeHandler.ts`)

After `executeAgentCore()` returns:

1. Check if `output.dispatchResult` exists (child was dispatched).
2. If no dispatch: return response normally (existing behavior, unchanged).
3. If dispatch detected:
   a. Subscribe: `notifier.waitForCompletion(executionId, timeoutMs)`.
   b. Call `dispatchIfNeeded()` (suspends parent, writes pending child).
   c. Block until result or timeout.
   d. If result: return `{ text: result.text, ... }`.
   e. If timeout: fall back to DB read of `agent_executions` status. If completed, read final text from `agent_execution_messages`. Otherwise return `{ text: '', executionId }`.

**Race condition safety:** Subscribe happens BEFORE `dispatchIfNeeded`. Even if workers complete instantly, the subscriber is already listening.

### Resume Parent Handler (`resumeParentHandler.ts`)

After `reinvokeParent()` completes:

1. If the resumed parent's output has **no new dispatch** (chain complete): call `notifier.notifyCompletion(parentExecutionId, { status, text, executionId })`.
2. If the output has another dispatch (nested grandchild): don't notify. The chain continues. The next resume will eventually notify.

The `executionId` is always the original root parent's `continueExecutionId`, so the HTTP handler waiting on that ID receives the final result regardless of nesting depth.

### Server Initialization (`index.ts`)

- Instantiate `RedisCompletionNotifier` (or `InProcessCompletionNotifier` based on config).
- Pass to route handlers and resume worker via dependency injection.
- Call `shutdown()` on `SIGTERM`/`SIGINT`.

## Nested Composition (N-depth)

```
HTTP handler waits on completion:{parentExecId}
  -> childWorker runs child
       -> child dispatches grandchild -> childWorker runs grandchild
            -> grandchild finishes -> resumeWorker resumes child
                 -> child finishes -> resumeWorker resumes parent
                      -> parent completes -> notifyCompletion(parentExecId)
```

No changes to worker logic. The existing `childExecutionWorker` and `resumeWorker` already handle N-depth recursion via the `agent_stack_entries` table. The only addition is the `notifyCompletion` call at the terminal point of `reinvokeParent`.

## Timeout and Fallback

- Default timeout: 120 seconds, configurable via `COMPLETION_TIMEOUT_MS` env var.
- On timeout: unsubscribe, disconnect subscriber, attempt DB fallback read.
- DB fallback: read `agent_executions.status` for the execution ID. If `completed`, read final assistant message from `agent_execution_messages`. If still `suspended`, return `{ text: '', executionId }` so the caller can poll.

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `REDIS_URL` | (required) | Redis Cloud connection string for ioredis |
| `COMPLETION_TIMEOUT_MS` | `120000` | Max wait time for composition completion |

## Files

### New Files

| File | Purpose |
|---|---|
| `src/notifications/completionNotifier.ts` | Interface and `ExecutionResult` type |
| `src/notifications/redisCompletionNotifier.ts` | Redis Cloud Pub/Sub implementation |
| `src/notifications/inProcessCompletionNotifier.ts` | EventEmitter implementation for dev/test |

### Modified Files

| File | Change |
|---|---|
| `src/routes/execute/executeHandler.ts` | After dispatch detected, subscribe + wait before returning response |
| `src/routes/internal/resumeParentHandler.ts` | Call `notifyCompletion` when resumed parent has no further dispatch |
| `src/index.ts` | Instantiate notifier, pass to routes, shutdown on exit |

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

## Non-Goals

- Streaming SSE for production execution (future work, not this spec).
- Changing worker architecture, polling intervals, or DB schema.
- Replacing Upstash for cache operations (already split in Redis migration).
