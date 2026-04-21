# Execution API Composition Wiring — Design Spec

## Problem

The execution API's agent composition infrastructure (DB tables, query functions, internal endpoints) exists but is not connected. Five bugs prevent composition from working in production:

1. **No message isolation** — `getSessionMessages` loads all messages by `session_id`. Parent and child share a session, so the child sees the parent's entire conversation history.
2. **Wrong tool result format** — `resumeParentHandler` writes `{ text: childOutput }` instead of AI SDK format.
3. **Dispatch not wired** — `executeCore.ts` calls the edge function but never checks for `dispatchResult`. The edge function returns it but `edgeFunctionClient.ts` never extracts it.
4. **Resume doesn't re-invoke parent** — `resumeParentHandler` restores state, pops stack, returns 200. Nothing triggers the parent to continue executing.
5. **Infrastructure never called** — `pushStackEntry`, `createPendingResume`, and `/internal/execute-child` are defined but never invoked from the execute flow.

## Scale Context

10 clients x 10 tenants x 10 agents x 2 executions/hour x 8 hours x 50 users = 80,000 main agent executions/day, multiplied by nesting depth. The event-driven serverless model (terminate parent, spawn child on new instance, resume parent on new instance) is required.

## Execution Flow (target state)

```
1. Parent runs on edge function instance A
2. Parent calls invoke_agent -> edge function returns dispatchResult
3. Backend receives dispatchResult in executeCore:
   a. Resolves child config (fetch published agent by slug+version, org-scoped)
   b. Creates child execution record (status: 'running', parent_execution_id set)
   c. Writes child's task as first user message (execution_id = child's)
   d. Finds toolCallId and toolName from parent's tool calls
   e. Creates placeholder tool result message (parent's execution_id, sentinel content)
   f. Pushes stack entry (snapshots parent state including toolCallId + toolName)
   g. Writes pending_child_execution row (durable intent for child dispatch)
   h. Returns to caller -- parent execution "suspended" (NOT completed)
4. Child execution worker picks up pending_child_execution:
   a. Atomically claims the row (UPDATE ... SET status='processing' WHERE status='pending' RETURNING *)
   b. Invokes edge function for child (new instance B)
   c. Child loads messages scoped to its execution_id (NOT session_id)
   d. Child has isChildAgent=true -> gets finish tool + CHILD_AGENT_INSTRUCTIONS
   e. Child runs its agent loop
5. Child calls finish -> edge function returns finishResult
6. Child execution worker receives finishResult:
   a. Creates pending_resume with childOutput, childStatus
   b. Atomically claims pending_resume (UPDATE ... SET status='processing' WHERE status='pending' RETURNING *)
   c. POSTs /internal/resume-parent
7. /internal/resume-parent handler:
   a. Atomically claims pending_resume (if not already claimed)
   b. Updates placeholder tool result message with child output (AI SDK format)
   c. Restores parent session state (currentNodeId, structuredOutputs)
   d. Atomically pops stack entry (CTE with FOR UPDATE SKIP LOCKED)
   e. Marks pending_resume completed
   f. Continues parent execution (same executionId, new edge function instance C)
   g. If parent dispatches another child -> cycle repeats
8. Resume worker (background, every 5s):
   - Polls pending_resumes with status='pending' using atomic claim
   - Retries failed resume attempts (max 10)
   - Safety net if step 6c fails
```

## Concurrency and Atomicity

### Atomic stack pop (Finding 1)

`popStackEntry` must be a single atomic SQL operation, not SELECT + DELETE:

```sql
WITH top AS (
  SELECT id FROM agent_stack_entries
  WHERE session_id = $1
  ORDER BY depth DESC LIMIT 1
  FOR UPDATE SKIP LOCKED
)
DELETE FROM agent_stack_entries WHERE id = (SELECT id FROM top)
RETURNING *;
```

If two callers race, one gets the row and the other gets nothing. The caller that gets nothing aborts.

### Atomic resume claim (Finding 2)

Both the direct POST to `/resume-parent` and the resume worker must atomically claim the pending_resume before processing:

```sql
UPDATE pending_resumes
SET status = 'processing'
WHERE parent_execution_id = $1 AND status = 'pending'
RETURNING *;
```

If the UPDATE returns zero rows, another process already claimed it. The caller aborts. This prevents double parent invocation.

The resume worker's `fetchPendingResumes` must also use `FOR UPDATE SKIP LOCKED` to prevent two workers from processing the same row.

### Atomic child execution claim (Finding 3)

The `pending_child_executions` table (new) uses the same pattern:

```sql
UPDATE pending_child_executions
SET status = 'processing'
WHERE id = $1 AND status = 'pending'
RETURNING *;
```

## Durable Child Dispatch (Finding 3)

`setImmediate`/fire-and-forget is unsafe in serverless environments. Instead, use a durable `pending_child_executions` table with the same poll-and-retry pattern as `pending_resumes`.

### New table: `pending_child_executions`

```sql
CREATE TABLE pending_child_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id),
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  agent_config jsonb NOT NULL,
  org_id uuid NOT NULL,
  api_key_enc text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(execution_id)
);
```

### New worker: `childExecutionWorker`

Same pattern as `resumeWorker`: polls every 5s, batch size 10, max 10 attempts. For each pending row:
1. Atomically claim via UPDATE
2. Load child config from the row
3. Call `executeAgentCore` for the child
4. On success: update status to 'completed'
5. On failure: increment attempts, set status back to 'pending'

This replaces the `/internal/execute-child` POST + `setImmediate` pattern. The `executeChildHandler` endpoint becomes unnecessary — child dispatch is handled entirely by the worker.

## Execution Continuation (Finding 4)

Re-invoking the parent via `executeAgentCore` creates a NEW execution record, fragmenting history and orphaning the original.

### Fix: `continueExecution` path

Add a `continueExecutionId` parameter to `executeAgentCore`. When set:
- Skip `createExecution` (don't create a new record)
- Load messages and config from the existing execution
- Call the edge function
- Update (not create) the existing execution record on completion
- Token/step totals are accumulated onto the existing record

The resume handler passes `continueExecutionId: parentExecutionId` when re-invoking the parent. The parent's execution record stays the same across the full dispatch-resume cycle.

## Fix 1: Message Isolation

**Current:** `executeFetcher.ts:238` calls `getSessionMessages(sessionId)` which loads ALL messages in the session.

**Fix:** Scope messages by `execution_id`, not `session_id`:

- `executeFetcher.ts`: always use `getExecutionMessages(supabase, executionId)` instead of `getSessionMessages`
- The parent's messages are written with `execution_id = parentExecutionId`
- The child's messages are written with `execution_id = childExecutionId`
- When the parent resumes, it loads its own messages (which include the placeholder tool result, now updated with child output)
- The child never sees the parent's messages

**Note:** `getExecutionMessages` (executionQueries.ts:84) returns a different shape than `getSessionMessages`. Unify the return types: add `id` and `created_at` to `getExecutionMessages`'s SELECT clause so both functions return `MessageRow[]`.

## Fix 2: Tool Result Message Format

**Current:** `resumeParentHandler.ts:39` writes `{ text: childOutput }`.

**Fix:** Write the full AI SDK format:

```typescript
{
  role: 'tool',
  content: [{
    type: 'tool-result',
    toolCallId,
    toolName,
    output: { type: 'text', value: childOutput }
  }]
}
```

`toolCallId` and `toolName` are stored in `parent_session_state` JSONB when the stack entry is pushed (no schema migration needed):

```typescript
parentSessionState: {
  currentNodeId: '...',
  structuredOutputs: { ... },
  toolCallId: 'tc-xxx',
  toolName: 'invoke_agent',
}
```

### Placeholder content

When the placeholder tool result message is created at dispatch time (step 3e), its content is:

```typescript
{
  role: 'tool',
  content: [{
    type: 'tool-result',
    toolCallId,
    toolName,
    output: { type: 'text', value: '__CHILD_PENDING__' }
  }]
}
```

This sentinel value is never seen by the LLM because the parent's agent loop has already returned at this point. The placeholder is updated with actual output before the parent resumes.

## Fix 3: Wire Dispatch in executeCore

**Current:** `executeCore.ts` calls `executeAgent()`, gets output, persists it, returns. Never checks `dispatchResult`.

**Fix — three parts:**

### 3a. Extract dispatchResult from edge function response

In `edgeFunctionClient.ts` / `edgeFunctionAgentEvents.ts`: extract `dispatchResult` and `finishResult` from the `agent_response` SSE event and include them in the returned result.

### 3b. Handle dispatch in executeCore

After `executeAgent()` returns and the result is persisted, check `output.dispatchResult`. If present, call `handleDispatchResult()` from `executeDispatchHandler.ts`.

### 3c. handleDispatchResult logic

New file: `packages/backend/src/routes/execute/executeDispatchHandler.ts`

1. Resolve child config — fetch published agent/workflow by slug+version (org-scoped). Load config from DB, NOT from the request body (defense in depth).
2. Create child execution record in `agent_executions` (status: 'running', `parent_execution_id` set)
3. Write child's task as first user message in `agent_execution_messages` (execution_id = child's)
4. Find the `toolCallId` and `toolName` from the parent's tool calls that triggered the dispatch
5. Create placeholder tool result message in `agent_execution_messages` (parent's execution_id, sentinel content)
6. Push stack entry with parent state snapshot (including `toolCallId`, `toolName`)
7. Write `pending_child_execution` row (durable intent — the child execution worker picks this up)
8. Update parent execution status to 'suspended' (new status, distinguishes from 'running')

All DB writes in steps 2-8 should be in a single transaction where possible.

## Fix 4: Resume Handler Re-invokes Parent

**Current:** `resumeParentHandler.ts` restores state, pops stack, returns 200.

**Fix:** After restoring state and popping the stack, continue the parent execution using the `continueExecution` path:

1. Atomically claim pending_resume (UPDATE ... WHERE status='pending' RETURNING *) — if zero rows, abort (already claimed)
2. Update tool result message with child output (Fix 2 format)
3. Restore parent session state
4. Atomically pop stack entry — if no row returned, abort (already popped)
5. Mark pending_resume completed
6. Call `executeAgentCore` with `continueExecutionId: parentExecutionId` (same execution record, new edge function call)
7. Return 200

If the parent dispatches ANOTHER child when it resumes, `executeAgentCore` detects the new `dispatchResult` via Fix 3 — the cycle repeats.

## Fix 5: Durable Child Execution

**Current:** `/internal/execute-child` returns 202. Nothing triggers the child.

**Fix:** Replace the fire-and-forget POST with a durable worker pattern:

- `handleDispatchResult` writes a `pending_child_execution` row (Fix 3, step 7)
- `childExecutionWorker` polls every 5s, claims rows atomically, invokes the child's edge function
- When child finishes: creates `pending_resume` with `childOutput` and `childStatus`, then POSTs `/internal/resume-parent`
- When child crashes: creates `pending_resume` with `childStatus: 'error'` and error message

The `/internal/execute-child` endpoint is either removed or kept as a manual trigger for debugging.

## Multi-turn Children

**Out of scope for this spec.** Children must complete in a single invocation (they can have multiple LLM steps and tool calls, but cannot ask the user for input). Multi-turn children require stack-based routing in `executeHandler.ts` where incoming user messages are routed to the active child — this is a separate feature.

## Files

### New

| File | Purpose |
|------|---------|
| `packages/backend/src/routes/execute/executeDispatchHandler.ts` | Handle dispatch: resolve child, push stack, create child execution intent |
| `packages/backend/src/workers/childExecutionWorker.ts` | Poll pending_child_executions, invoke child edge functions |
| `supabase/migrations/YYYYMMDD_pending_child_executions.sql` | New table for durable child dispatch |

### Modified

| File | Changes |
|------|---------|
| `packages/backend/src/routes/execute/edgeFunctionClient.ts` | Extract `dispatchResult`/`finishResult` from agent_response SSE event |
| `packages/backend/src/routes/execute/edgeFunctionAgentEvents.ts` | Include dispatch/finish in `buildAgentLoopResult` |
| `packages/backend/src/routes/execute/executeCore.ts` | Check for `dispatchResult` after edge function call; add `continueExecutionId` path |
| `packages/backend/src/routes/execute/executeFetcher.ts` | Use `getExecutionMessages` (execution-scoped) instead of `getSessionMessages` |
| `packages/backend/src/routes/internal/resumeParentHandler.ts` | Atomic claim, fix tool result format, re-invoke parent via `continueExecution` path, atomic pop |
| `packages/backend/src/db/queries/stackQueries.ts` | Make `popStackEntry` atomic (CTE with FOR UPDATE SKIP LOCKED) |
| `packages/backend/src/db/queries/resumeQueries.ts` | Add atomic claim function, add FOR UPDATE SKIP LOCKED to fetch |
| `packages/backend/src/db/queries/executionQueries.ts` | Unify `getExecutionMessages` return type with `MessageRow[]` |
| `packages/backend/src/workers/resumeWorker.ts` | Use atomic claim instead of simple fetch |
| `packages/backend/src/server.ts` | Register `childExecutionWorker` |

### Removed

| File | Reason |
|------|--------|
| `packages/backend/src/routes/internal/executeChildHandler.ts` | Replaced by `childExecutionWorker` (durable pattern) |

## Error Handling

1. **Child dispatch fails** (DB write fails): Transaction rolls back. No orphan state.
2. **Child worker crashes** (process dies mid-execution): `pending_child_execution` stays in 'processing'. A timeout mechanism (pg_cron or worker heartbeat) detects stale 'processing' rows and resets them to 'pending' for retry.
3. **Child execution crashes** (edge function throws): Worker catches error, creates `pending_resume` with `childStatus: 'error'`, `childOutput: error.message`. Parent gets error as tool result.
4. **Resume fails** (parent re-invocation fails): `pending_resume` stays in 'pending'. Resume worker retries every 5s, max 10 attempts.
5. **Backend crash between stack push and child intent write**: Transaction ensures both succeed or neither does.
6. **Double resume attempt** (worker + direct POST race): Atomic claim prevents both from processing. Second caller gets zero rows and aborts.

## Security

- Child config resolution filters by `org_id` — same as simulation resolver
- `executeChildHandler` removed — child config loaded from DB by the worker, never from request body
- API key inheritance: children use parent's API key
- Stack depth enforced: check `getStackDepth` before pushing (default max 10)

## Testing

Integration tests (mock edge function):
1. Full cycle: dispatch -> stack push -> child execute -> finish -> resume -> parent continue
2. Message isolation: child doesn't see parent messages, parent doesn't see child messages
3. Tool result format: AI SDK compatible after resume
4. Recursive dispatch: parent -> child -> grandchild -> unwind
5. Error propagation: child crash -> parent gets error tool result
6. Concurrency: two resume attempts -> only one processes (atomic claim)
7. Worker retry: child dispatch fails -> worker retries
8. Execution continuity: parent execution record is the same before and after resume
