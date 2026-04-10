# Composition Bug Fixes + Frontend State Machine Refactor

## Problem

The staff engineer review found 13 bugs across the composition system (API, backend, frontend, edge function) and identified a fundamental architecture issue in the frontend: 6 React refs fighting async state updates, stale closures in SSE callbacks, and orchestration logic scattered across 3 hook files.

## Scope

**Part A:** Fix all 13 bugs identified in the review.
**Part B:** Refactor frontend composition to a pure state machine pattern.

Both parts are done together because Part B replaces the frontend files that have bugs from Part A.

---

## Part A: Bug Fixes

### Fix 1: Empty `parentToolCallId` in workflow dispatch

**File:** `packages/backend/src/routes/simulateHandler.ts`

**Bug:** `emitChildDispatched` passes `parentToolCallId: ''`. When the child finishes and `popChild` injects a tool result with `toolCallId: ''`, the parent LLM can't match it to any tool call. The workflow can't resume.

**Fix:** Extract the actual tool call ID from the workflow result's `toolCalls` array. The dispatch tool call has `toolName` matching the dispatch type. Find it and use its `toolCallId`. Also extract from `result.toolCalls` since the workflow executor puts tool calls there. Need to unwrap the AI SDK `{type, value}` envelope on the output to find the dispatch tool call.

### Fix 2: `findDispatchToolCall` doesn't unwrap AI SDK output

**File:** `packages/backend/src/routes/simulationOrchestratorHelpers.ts`

**Bug:** `findDispatchToolCall` calls `isDispatchSentinel(tc.output)` without `unwrapToolOutput`. If the AI SDK wraps the output in `{type: 'json', value: {...}}`, the dispatch is silently lost.

**Fix:** Import `unwrapToolOutput` from the API package and call it before `isDispatchSentinel`.

### Fix 3: `version: 'latest'` silently uses version 1

**Files:** `packages/backend/src/routes/simulateChildResolver.ts`

**Bug:** `numberOrNull(params, 'version')` returns `null` for `"latest"`, falling back to `DEFAULT_VERSION = 1`. The resolver never queries for the latest published version.

**Fix:** Check if `version === 'latest'` before calling `numberOrNull`. If latest, query `agent_versions` for `MAX(version)` filtered by `agent_id` and `org_id`. Use that version number.

### Fix 4: Edge function hardcodes `isChildAgent: false`

**Files:** `supabase/functions/execute-agent/index.ts`, `packages/backend/src/routes/execute/edgeFunctionClient.ts`

**Bug:** `injectSystemTools({ existingTools: allTools, isChildAgent: false })` — child agents in the execution API never get the `finish` tool.

**Fix:** Add `isChildAgent?: boolean` to the edge function payload (`ExecuteAgentParams`). Pass it from the backend when calling the edge function. The `childExecutionWorker` and `executeAgentCore` set it based on whether the execution has a `parent_execution_id`.

### Fix 5: Dead code `simulateWorkflowDispatch.ts`

**File:** `packages/backend/src/routes/simulateWorkflowDispatch.ts`

**Bug:** File is never imported. Represents an old approach superseded by the orchestrator.

**Fix:** Delete the file.

### Fix 6: API key in SSE events

**File:** `packages/backend/src/routes/simulateHandler.ts`

**Bug:** `childConfig` in the `child_dispatched` SSE event includes `apiKey` sent to the browser.

**Fix:** Remove `apiKey` from the `childConfig` in the SSE event. The frontend doesn't need it — it already has the `apiKeyId` which the Next.js route resolves.

### Fix 7: `continueParentAfterError` doesn't handle recursive dispatch

**File:** `packages/backend/src/routes/simulationOrchestrator.ts`

**Bug:** If a parent dispatches a second child after recovering from a first child's error, the dispatch is silently dropped because `continueParentAfterError` doesn't check the result for `dispatchResult`.

**Fix:** After re-running the parent loop in `continueParentAfterError`, check the result for `dispatchResult` and handle it the same way `rerunParentWithToolResult` does.

### Fix 8: Non-atomic batch claims in workers

**Files:** `packages/backend/src/db/queries/childExecutionQueries.ts`, `packages/backend/src/db/queries/resumeQueries.ts`

**Bug:** `fetchAndClaimChildExecutions` and `fetchAndClaimPendingResumes` use Supabase's PostgREST `UPDATE ... WHERE status='pending' ... LIMIT N` which is NOT atomic with `FOR UPDATE SKIP LOCKED`. Two workers could claim the same row.

**Fix:** Create Postgres functions (like `pop_stack_entry`) that use CTEs with `FOR UPDATE SKIP LOCKED` for claiming batches. Add migrations for these functions.

### Fix 9: No transaction wrapping in dispatch handler

**File:** `packages/backend/src/routes/execute/executeDispatchHandler.ts`

**Bug:** Stack push and pending child write are separate DB calls. Crash between them orphans state.

**Fix:** Document the idempotency guarantee: the `pending_child_executions` unique constraint on `execution_id` prevents duplicate child dispatch. If the stack entry exists but the pending row doesn't, the child execution worker won't pick it up, and the resume worker will eventually time out and error. Add a cleanup mechanism or at minimum a log warning for orphaned stack entries. Full transaction wrapping requires raw SQL which Supabase JS client doesn't support.

### Fix 10: Resume handler passes child output as user message

**File:** `packages/backend/src/routes/internal/resumeParentHandler.ts`

**Bug:** `reinvokeParent` passes `message: { text: data.childOutput }` as the user input for `executeAgentCore`. The parent sees both the tool result AND a duplicate user message with the child's output.

**Fix:** When `continueExecutionId` is set, don't add a user message. The parent's existing message history (with the updated tool result) is sufficient.

### Fix 11: `conversationId: null` on continue path

**File:** `packages/backend/src/routes/execute/executeCore.ts`

**Bug:** `setupExecution` returns `conversationId: null` when `continueExecutionId` is set. `persistMessagingPostExecution` may not update messaging state.

**Fix:** Skip `persistMessagingPostExecution` entirely when `continueExecutionId` is set — the parent's messaging was already set up on the first execution.

### Fix 12: `create_agent` child worker uses parent's config

**File:** `packages/backend/src/workers/childExecutionWorker.ts`

**Bug:** `buildCoreInput` loads `agent_id` and `version` from the `agent_executions` record, then `executeAgentCore` loads the published graph data. For `create_agent` children, this loads the parent's config, not the dynamic child's.

**Fix:** Use `agent_config` from the `pending_child_executions` row (which stores the resolved child config) instead of loading from the published agent record.

### Fix 13: Hardcoded "Simulation" string

**File:** `packages/web/app/components/panels/simulation/SimulationPanel.tsx`

**Bug:** `"Simulation"` at line 113 not using `t()`.

**Fix:** Use `t('title')` and add translation key.

---

## Part B: Frontend State Machine Refactor

### Problem

`useSimulation.ts` has 6 refs because SSE callbacks capture stale React state. The orchestration logic (dispatch → auto-send → child waiting → child finished → resume parent) is scattered across `useSimulation.ts`, `useSimulationComposition.ts`, and `useSimulationHelpers.ts` as callbacks, refs, and closures.

### Solution

A pure TypeScript state machine that lives outside React. It holds all composition state and transitions it synchronously. React subscribes via `useSyncExternalStore`.

### State Machine

**File:** `packages/web/app/hooks/compositionMachine.ts`

Pure function — no React, no side effects, fully testable.

```typescript
interface CompositionState {
  stack: CompositionLevel[];
  rootMessages: Message[];
  phase: 'idle' | 'running' | 'child_dispatched' | 'child_running' | 'child_waiting' | 'resuming_parent';
  pendingDispatch: PendingChildDispatch | null;
  childConfig: ChildAgentConfig | null;
}

type CompositionEvent =
  | { type: 'START'; rootMessages: Message[] }
  | { type: 'CHILD_DISPATCHED'; event: SimChildDispatchedEvent; parentMessages: Message[] }
  | { type: 'CHILD_AUTO_SENT' }
  | { type: 'CHILD_RESPONSE'; text: string; messages: Message[] }
  | { type: 'USER_MESSAGE'; text: string }
  | { type: 'CHILD_FINISHED'; output: string; status: 'success' | 'error' }
  | { type: 'PARENT_RESUMED' }
  | { type: 'STREAM_COMPLETED' }
  | { type: 'RESET' };

function transition(state: CompositionState, event: CompositionEvent): CompositionState
```

Transitions use `pushChild`, `popChild`, `appendUserMessage`, `getActiveMessages` from `useCompositionStack.ts` — the pure functions we already tested.

### Store

**File:** `packages/web/app/hooks/compositionStore.ts`

Wraps the machine with subscribe/getSnapshot for `useSyncExternalStore`.

```typescript
class CompositionStore {
  private state: CompositionState;
  private listeners = new Set<() => void>();

  dispatch(event: CompositionEvent): void {
    this.state = transition(this.state, event);
    this.listeners.forEach(fn => fn());
  }

  getSnapshot(): CompositionState { return this.state; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

### React Integration

In `useSimulation.ts`:

```typescript
const store = useRef(new CompositionStore()).current;
const comp = useSyncExternalStore(store.subscribe, store.getSnapshot);
```

SSE callbacks dispatch events to the store:

```typescript
onSimChildDispatched: (event) => store.dispatch({ type: 'CHILD_DISPATCHED', event, parentMessages: [...] }),
onSimChildFinished: (event) => store.dispatch({ type: 'CHILD_FINISHED', output: event.output, status: event.status }),
onComplete: () => store.dispatch({ type: 'STREAM_COMPLETED' }),
```

### Side Effects via useEffect

The state machine is pure — it doesn't send HTTP requests. Side effects are triggered by `useEffect` reacting to phase changes:

```typescript
useEffect(() => {
  if (comp.phase === 'child_dispatched' && comp.pendingDispatch) {
    sendChildRequest(comp);
    store.dispatch({ type: 'CHILD_AUTO_SENT' });
  }
}, [comp.phase, comp.pendingDispatch]);

useEffect(() => {
  if (comp.phase === 'resuming_parent') {
    sendWorkflowResumeRequest(comp);
    store.dispatch({ type: 'PARENT_RESUMED' });
  }
}, [comp.phase]);
```

### What Gets Deleted

- `useSimulationComposition.ts` — all of it (replaced by machine + store)
- All 6 refs in `useSimulation.ts` (`compositionStackRef`, `messagesRef`, `pendingChildRef`, `pendingParentResumeRef`, `autoResumeParentRef`, `sendDepsRef`)
- `buildMergedCallbacks` function
- `routeUserMessage` function
- `resetBeforeSendComposition` function
- The complex `onComplete` handler with 3 conditional branches

### What Gets Created

- `compositionMachine.ts` — pure transition function (~100 lines)
- `compositionStore.ts` — store class (~30 lines)
- Updated `useSimulation.ts` — uses `useSyncExternalStore`, dispatches events, runs effects

### What Stays Unchanged

- `useCompositionStack.ts` — pure functions used by the machine
- `compositionStackHelpers.ts` — message creation helpers
- `sseSimComposition.ts` — SSE event types and parsing
- `useSimulationHelpers.ts` — `buildStreamCallbacks`, `buildSimulateParams` (without composition merging)

### Testing

The `compositionMachine.ts` transition function is pure and fully testable:
- Same test scenarios as Part 1 tests (push, pop, message isolation, round-trip)
- Phase transitions: idle → running → child_dispatched → child_running → child_waiting → child_finished → resuming_parent → running
- The existing 21 composition stack tests continue to pass (they test the underlying pure functions)

---

## Files Summary

### Part A: Modified

| File | Change |
|------|--------|
| `simulateHandler.ts` | Fix parentToolCallId, remove apiKey from SSE |
| `simulationOrchestratorHelpers.ts` | Add unwrapToolOutput to findDispatchToolCall |
| `simulateChildResolver.ts` | Handle `version: 'latest'` |
| `execute-agent/index.ts` | Accept isChildAgent from payload |
| `edgeFunctionClient.ts` | Pass isChildAgent to edge function |
| `simulationOrchestrator.ts` | Fix continueParentAfterError recursive dispatch |
| `childExecutionQueries.ts` | Atomic batch claims |
| `resumeQueries.ts` | Atomic batch claims |
| `executeDispatchHandler.ts` | Document idempotency |
| `resumeParentHandler.ts` | Don't add user message on continue |
| `executeCore.ts` | Skip messaging on continue |
| `childExecutionWorker.ts` | Use agent_config from pending row |
| `SimulationPanel.tsx` | Translate "Simulation" |
| `dispatchTools.ts` | Already fixed (z.union) |

### Part A: Deleted

| File | Reason |
|------|--------|
| `simulateWorkflowDispatch.ts` | Dead code |

### Part A: New migrations

| File | Purpose |
|------|---------|
| `20260410_atomic_worker_claims.sql` | Postgres functions for atomic batch claims |

### Part B: Created

| File | Purpose |
|------|---------|
| `compositionMachine.ts` | Pure state machine transition function |
| `compositionStore.ts` | Store class for useSyncExternalStore |

### Part B: Deleted

| File | Reason |
|------|--------|
| `useSimulationComposition.ts` | Replaced by machine + store |

### Part B: Modified

| File | Change |
|------|--------|
| `useSimulation.ts` | Replace refs with useSyncExternalStore, dispatch events, useEffect for side effects |
| `useSimulationState.ts` | Remove compositionStack from React state (now in machine) |
| `useSimulationHelpers.ts` | Remove composition-related exports, keep base stream callbacks |
| `SimulationPanel.tsx` | Read from machine state instead of simulation.compositionStack |
| `GraphBuilder.tsx` | Pass store or state to SimulationPanel |

## Implementation Order

1. Part A bug fixes (backend/API — no frontend changes needed)
2. Part B: Create `compositionMachine.ts` with tests
3. Part B: Create `compositionStore.ts`
4. Part B: Refactor `useSimulation.ts` to use store
5. Part B: Update UI components
6. Part B: Delete `useSimulationComposition.ts`
7. Verify all 21 composition tests still pass
8. End-to-end test: workflow → child agent → multi-turn → finish → parent resumes
