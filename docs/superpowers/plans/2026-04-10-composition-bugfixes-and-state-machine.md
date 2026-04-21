# Composition Bug Fixes + State Machine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 bugs found in the staff engineer review and replace the ref-heavy frontend composition hooks with a pure state machine + `useSyncExternalStore`.

**Architecture:** Part A fixes backend/API bugs independently. Part B replaces `useSimulationComposition.ts` (6 refs, stale closures, scattered logic) with a pure `transition()` function in `compositionMachine.ts` and a `CompositionStore` class consumed via `useSyncExternalStore`. React just renders; the machine handles all state transitions synchronously.

**Tech Stack:** TypeScript, React 19, `useSyncExternalStore`, Jest, Express, Supabase, AI SDK v4

**Spec:** `docs/superpowers/specs/2026-04-10-composition-bugfixes-and-state-machine.md`

---

## Phase A: Backend & API Bug Fixes

### Task A1: Fix empty parentToolCallId + remove apiKey from SSE (Fixes 1, 6)

**Files:**
- Modify: `packages/backend/src/routes/simulateHandler.ts`

- [ ] **Step 1: Extract parentToolCallId from workflow result toolCalls**

In `emitChildDispatched`, the `result` parameter comes from `executeWithCallbacks` which returns `CallAgentOutput`. The `result.toolCalls` array contains the dispatch tool call. Find the tool call whose output is a dispatch sentinel (unwrap the AI SDK envelope) and use its `toolCallId`.

Replace the `emitChildDispatched` function. Key changes:
- Accept the full `CallAgentOutput` result (not just `dispatchResult`) so we can access `result.toolCalls`
- Find the dispatch tool call in `result.toolCalls` by checking if the output (unwrapped) is a dispatch sentinel
- Use its `toolCallId` instead of `''`
- Remove `apiKey` from `childConfig` in the SSE event

The tool call objects in `CallAgentOutput.toolCalls` are `TypedToolCall<Record<string, Tool>>` which have `toolCallId`, `toolName`, and `args`. But the *output* is not on the TypedToolCall — it's in the response messages. The dispatch tool's execute function returns a sentinel synchronously, which the AI SDK puts in the response messages as a tool-result.

Actually, looking at the workflow path more carefully: the `CallAgentOutput` from `executeWithCallbacks` has `toolCalls` which come from `agentRes.allToolCalls` in the state machine. These include `toolCallId`. The tool result (sentinel) is in `result.toolResults` or in the `toolCalls` output field from the node processor.

The simplest approach: search `result.toolCalls` for a tool call whose `toolName` matches the dispatch type (`invoke_agent`, `create_agent`, `invoke_workflow`). Use its `toolCallId`. If the `toolCallId` is the tool name as fallback (which can happen), generate a UUID.

Update `emitChildDispatched` to accept the full result and extract the tool call ID:

```typescript
function findToolCallId(result: CallAgentOutput, dispatchType: string): string {
  for (const tc of result.toolCalls) {
    if (tc.toolName === dispatchType) {
      return typeof tc.toolCallId === 'string' && tc.toolCallId !== '' 
        ? tc.toolCallId 
        : `tc-${randomUUID()}`;
    }
  }
  return `tc-${randomUUID()}`;
}
```

And remove `apiKey` from the childConfig in the SSE event. The frontend already has `apiKeyId`.

- [ ] **Step 2: Update the call site**

In `runSimulation`, pass the full `result` to `emitChildDispatched` instead of just `result.dispatchResult`.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/simulateHandler.ts
git commit -m "fix: extract parentToolCallId from workflow result, remove apiKey from SSE"
```

---

### Task A2: Fix findDispatchToolCall unwrap (Fix 2)

**Files:**
- Modify: `packages/backend/src/routes/simulationOrchestratorHelpers.ts`

- [ ] **Step 1: Add unwrapToolOutput before isDispatchSentinel**

Import `unwrapToolOutput` from `@daviddh/llm-graph-runner` (it's exported from the API package). In `findDispatchToolCall`, change:

```typescript
if (isDispatchSentinel(tc.output)) {
```
to:
```typescript
if (isDispatchSentinel(unwrapToolOutput(tc.output))) {
```

Check if `unwrapToolOutput` is exported from the API package index. If not, export it.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/simulationOrchestratorHelpers.ts
git commit -m "fix: unwrap AI SDK envelope in findDispatchToolCall"
```

---

### Task A3: Fix version 'latest' handling (Fix 3)

**Files:**
- Modify: `packages/backend/src/routes/simulateChildResolver.ts`

- [ ] **Step 1: Add resolveVersion function**

Add a function that handles `"latest"` by querying max version:

```typescript
async function resolveVersion(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  agentId: string
): Promise<number> {
  const raw = params.version;
  if (raw === 'latest') {
    const result = await supabase
      .from('agent_versions')
      .select('version')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = result.data as { version: number } | null;
    if (row === null) throw new Error(`No published versions for agent "${agentId}"`);
    return row.version;
  }
  return numberOrNull(params, 'version') ?? DEFAULT_VERSION;
}
```

- [ ] **Step 2: Update resolveInvokeAgent and resolveInvokeWorkflow to use resolveVersion**

Replace `const version = numberOrNull(params, 'version') ?? DEFAULT_VERSION;` with:
```typescript
const agentId = await lookupAgentId(supabase, slug, orgId);
const version = await resolveVersion(supabase, params, agentId);
```

Note: `lookupAgentId` must be called before `resolveVersion` since we need the `agentId`.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/simulateChildResolver.ts
git commit -m "fix: handle version 'latest' by querying max published version"
```

---

### Task A4: Fix edge function isChildAgent (Fix 4)

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts`
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`

- [ ] **Step 1: Add isChildAgent to edge function payload**

In the edge function's payload interface, add `isChildAgent?: boolean`. In `runAgentExecution`, use `payload.isChildAgent ?? false` when calling `injectSystemTools`.

In the workflow path (`runWorkflowExecution`), always pass `isChildAgent: false` (workflows don't use finish).

- [ ] **Step 2: Pass isChildAgent from backend**

In `edgeFunctionClient.ts`, add `isChildAgent?: boolean` to `ExecuteAgentParams`. Pass it through in the JSON body sent to the edge function.

In `executeCore.ts` or `executeCoreHelpers.ts`, set `isChildAgent: true` when the execution has a `parent_execution_id` (i.e., it's a child execution).

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/execute-agent/index.ts packages/backend/src/routes/execute/edgeFunctionClient.ts
git commit -m "fix: pass isChildAgent to edge function so children get finish tool"
```

---

### Task A5: Delete dead code + fix orchestrator error path (Fixes 5, 7)

**Files:**
- Delete: `packages/backend/src/routes/simulateWorkflowDispatch.ts`
- Modify: `packages/backend/src/routes/simulationOrchestrator.ts`

- [ ] **Step 1: Delete simulateWorkflowDispatch.ts**

Remove the file. Verify nothing imports it.

- [ ] **Step 2: Fix continueParentAfterError**

In `continueParentAfterError`, after `executeAgentLoop` returns, check the result for `dispatchResult`. If found, call `handleDispatch` (same as `rerunParentWithToolResult` does). Replace:

```typescript
const parentResult = await executeAgentLoop(loopConfig, loopCallbacks);
return completedResult(parentResult);
```

with logic that checks `parentResult.dispatchResult` and handles it recursively (same pattern as the success path).

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git rm packages/backend/src/routes/simulateWorkflowDispatch.ts
git add packages/backend/src/routes/simulationOrchestrator.ts
git commit -m "fix: delete dead simulateWorkflowDispatch, fix error path recursive dispatch"
```

---

### Task A6: Atomic worker claims (Fix 8)

**Files:**
- Create: `supabase/migrations/20260410100000_atomic_worker_claims.sql`
- Modify: `packages/backend/src/db/queries/childExecutionQueries.ts`
- Modify: `packages/backend/src/db/queries/resumeQueries.ts`

- [ ] **Step 1: Create Postgres functions for atomic batch claims**

Create migration with two functions:

```sql
-- Atomically claim N pending child executions
CREATE OR REPLACE FUNCTION claim_pending_child_executions(p_limit integer)
RETURNS SETOF pending_child_executions
LANGUAGE sql AS $$
  UPDATE pending_child_executions
  SET status = 'processing', last_attempt_at = now()
  WHERE id IN (
    SELECT id FROM pending_child_executions
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Atomically claim N pending resumes
CREATE OR REPLACE FUNCTION claim_pending_resumes(p_limit integer)
RETURNS SETOF pending_resumes
LANGUAGE sql AS $$
  UPDATE pending_resumes
  SET status = 'processing', last_attempt_at = now()
  WHERE id IN (
    SELECT id FROM pending_resumes
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
```

- [ ] **Step 2: Update childExecutionQueries to use RPC**

Replace `fetchAndClaimChildExecutions` with `supabase.rpc('claim_pending_child_executions', { p_limit: limit })`.

- [ ] **Step 3: Update resumeQueries to use RPC**

Replace `fetchAndClaimPendingResumes` with `supabase.rpc('claim_pending_resumes', { p_limit: limit })`.

- [ ] **Step 4: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260410100000_atomic_worker_claims.sql packages/backend/src/db/queries/childExecutionQueries.ts packages/backend/src/db/queries/resumeQueries.ts
git commit -m "fix: use atomic FOR UPDATE SKIP LOCKED in worker batch claims"
```

---

### Task A7: Fix resume handler + executeCore continue path (Fixes 9, 10, 11)

**Files:**
- Modify: `packages/backend/src/routes/internal/resumeParentHandler.ts`
- Modify: `packages/backend/src/routes/execute/executeCore.ts`
- Modify: `packages/backend/src/routes/execute/executeDispatchHandler.ts`

- [ ] **Step 1: Fix resume handler — don't add user message on continue**

In `reinvokeParent`, when building the `ExecuteCoreInput` for `executeAgentCore`, pass an empty `text` field or mark the input as a continuation. The simplest fix: add a `isContinuation: true` flag to the input, and in `setupExecution`, skip `buildUserMessage(input)` when `isContinuation` is true.

- [ ] **Step 2: Fix executeCore — skip messaging on continue**

In `persistCoreResult`, when `params.conversationId === null` (continue path), skip `persistMessagingPostExecution`.

- [ ] **Step 3: Document idempotency in dispatch handler**

Add a comment block in `executeDispatchHandler.ts` explaining the idempotency guarantees:
- `pending_child_executions.execution_id` has a UNIQUE constraint
- If stack entry exists but pending row doesn't, child won't execute
- Resume worker timeout handles orphaned states

- [ ] **Step 4: Verify**

Run: `npm run check -w packages/backend`

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/internal/resumeParentHandler.ts packages/backend/src/routes/execute/executeCore.ts packages/backend/src/routes/execute/executeDispatchHandler.ts
git commit -m "fix: don't add user message on continue, skip messaging persistence, document idempotency"
```

---

### Task A8: Fix child worker + translation (Fixes 12, 13)

**Files:**
- Modify: `packages/backend/src/workers/childExecutionWorker.ts`
- Modify: `packages/web/app/components/panels/simulation/SimulationPanel.tsx`
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Fix child worker to use agent_config from pending row**

In `processOneChildExecution`, when building the `ExecuteCoreInput`, check if the `PendingChildExecution.agent_config` contains `systemPrompt` (indicating a dynamically created child). If so, use the config from the pending row directly instead of loading from the published agent record.

- [ ] **Step 2: Translate "Simulation" string**

In `SimulationPanel.tsx`, replace the hardcoded `"Simulation"` with `t('title')`. Add `"title": "Simulation"` to `messages/en.json` under the `simulation` section.

- [ ] **Step 3: Verify**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/workers/childExecutionWorker.ts packages/web/app/components/panels/simulation/SimulationPanel.tsx packages/web/messages/en.json
git commit -m "fix: child worker uses agent_config from pending row, translate Simulation title"
```

---

## Phase B: Frontend State Machine Refactor

### Task B1: Create compositionMachine.ts with TDD tests

**Files:**
- Create: `packages/web/app/hooks/compositionMachine.ts`
- Create: `packages/web/app/hooks/__tests__/compositionMachine.test.ts`

- [ ] **Step 1: Write failing tests for the transition function**

The transition function takes `(state, event) => newState`. Test all phase transitions:

1. `RESET` → phase becomes `idle`, stack empty
2. `START` → phase becomes `running`, rootMessages set
3. `CHILD_DISPATCHED` → phase becomes `child_dispatched`, stack gains entry, `pendingDispatch` set
4. `CHILD_AUTO_SENT` → phase becomes `child_running`, `pendingDispatch` cleared
5. `USER_MESSAGE` when child active → message appended to active level in stack
6. `CHILD_RESPONSE` → assistant message appended to active level in stack
7. `CHILD_FINISHED` → phase becomes `resuming_parent`, stack popped, output injected as tool result
8. `PARENT_RESUMED` → phase becomes `running`
9. `STREAM_COMPLETED` when idle → no change

Test state invariants:
- Root messages never change when child is active (except on CHILD_FINISHED when tool result is injected)
- Stack levels have isolated messages
- Phase transitions are deterministic

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPatterns=compositionMachine`
Expected: All fail (module doesn't exist yet)

- [ ] **Step 3: Implement the transition function**

Create `compositionMachine.ts` with:

```typescript
import type { Message } from '@daviddh/llm-graph-runner';
import type { SimChildDispatchedEvent } from '../lib/sseSimComposition';
import type { ChildAgentConfig, CompositionLevel } from './useCompositionStack';
import { appendUserMessage, getActiveMessages, popChild, pushChild } from './useCompositionStack';
import { createAssistantMessage } from './useSimulationHelpers';

export interface CompositionState {
  stack: CompositionLevel[];
  rootMessages: Message[];
  phase: 'idle' | 'running' | 'child_dispatched' | 'child_running' | 'child_waiting' | 'resuming_parent';
  pendingDispatch: PendingChildDispatch | null;
  childConfig: ChildAgentConfig | null;
}

export interface PendingChildDispatch {
  task: string;
  childConfig: SimChildDispatchedEvent['childConfig'];
  label: string;
}

export type CompositionEvent = 
  | { type: 'START'; rootMessages: Message[] }
  | { type: 'CHILD_DISPATCHED'; event: SimChildDispatchedEvent; parentMessages: Message[] }
  | { type: 'CHILD_AUTO_SENT' }
  | { type: 'CHILD_RESPONSE'; text: string }
  | { type: 'USER_MESSAGE'; text: string }
  | { type: 'CHILD_FINISHED'; output: string; status: 'success' | 'error' }
  | { type: 'PARENT_RESUMED' }
  | { type: 'STREAM_COMPLETED' }
  | { type: 'RESET' };

export const INITIAL_STATE: CompositionState = {
  stack: [],
  rootMessages: [],
  phase: 'idle',
  pendingDispatch: null,
  childConfig: null,
};

export function transition(state: CompositionState, event: CompositionEvent): CompositionState {
  switch (event.type) {
    case 'RESET': return INITIAL_STATE;
    case 'START': return { ...state, rootMessages: event.rootMessages, phase: 'running' };
    case 'CHILD_DISPATCHED': return handleChildDispatched(state, event);
    case 'CHILD_AUTO_SENT': return { ...state, phase: 'child_running', pendingDispatch: null };
    case 'USER_MESSAGE': return handleUserMessage(state, event.text);
    case 'CHILD_RESPONSE': return handleChildResponse(state, event.text);
    case 'CHILD_FINISHED': return handleChildFinished(state, event.output, event.status);
    case 'PARENT_RESUMED': return { ...state, phase: 'running' };
    case 'STREAM_COMPLETED': return handleStreamCompleted(state);
    default: return state;
  }
}
```

Each handler is a pure function using `pushChild`, `popChild`, `appendUserMessage` from `useCompositionStack.ts`.

- [ ] **Step 4: Run tests**

Run: `npm run test -w packages/web -- --testPathPatterns=compositionMachine`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/compositionMachine.ts packages/web/app/hooks/__tests__/compositionMachine.test.ts
git commit -m "feat: add compositionMachine with pure transition function and tests"
```

---

### Task B2: Create compositionStore.ts

**Files:**
- Create: `packages/web/app/hooks/compositionStore.ts`

- [ ] **Step 1: Create the store**

```typescript
import { type CompositionEvent, type CompositionState, INITIAL_STATE, transition } from './compositionMachine';

export class CompositionStore {
  private state: CompositionState = INITIAL_STATE;
  private listeners = new Set<() => void>();

  dispatch(event: CompositionEvent): void {
    this.state = transition(this.state, event);
    this.listeners.forEach((fn) => fn());
  }

  getSnapshot = (): CompositionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
```

Note: `getSnapshot` and `subscribe` are arrow functions (stable references) required by `useSyncExternalStore`.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/compositionStore.ts
git commit -m "feat: add CompositionStore for useSyncExternalStore"
```

---

### Task B3: Refactor useSimulation.ts to use store

**Files:**
- Modify: `packages/web/app/hooks/useSimulation.ts`
- Modify: `packages/web/app/hooks/useSimulationState.ts`
- Modify: `packages/web/app/hooks/useSimulationHelpers.ts`
- Delete: `packages/web/app/hooks/useSimulationComposition.ts`

This is the largest task. The key changes:

- [ ] **Step 1: Remove composition state from useSimulationState**

In `useSimulationState.ts`, remove `compositionStack` from `CoreStateValues`, `CoreDispatchers`, and `SimulationHookState`. Remove the `useState<CompositionLevel[]>([])`. The composition state now lives in the machine.

- [ ] **Step 2: Remove composition exports from useSimulationHelpers**

Remove `createAssistantMessage` export (move to `compositionMachine.ts` if needed). Remove `setCompositionStack` from `SimulationSetters`. Keep `buildStreamCallbacks` and `buildSimulateParams` without composition merging.

- [ ] **Step 3: Rewrite useSimulation.ts**

Replace ALL the current composition machinery with:

1. Create store: `const store = useRef(new CompositionStore()).current;`
2. Subscribe: `const comp = useSyncExternalStore(store.subscribe, store.getSnapshot);`
3. SSE callbacks dispatch events:
   - `onSimChildDispatched: (event) => store.dispatch({ type: 'CHILD_DISPATCHED', event, parentMessages: messages })`
   - `onSimChildFinished: (event) => store.dispatch({ type: 'CHILD_FINISHED', output: event.output, status: event.status })`
   - `onComplete: () => store.dispatch({ type: 'STREAM_COMPLETED' })`
4. Side effects via `useEffect`:
   - When `comp.phase === 'child_dispatched'`: auto-send child agent request
   - When `comp.phase === 'resuming_parent'`: auto-send workflow resume request
5. Message routing: when `comp.stack.length > 0`, route to agent sim with child config from `comp.childConfig`

Delete ALL refs: `compositionStackRef`, `messagesRef`, `pendingChildRef`, `pendingParentResumeRef`, `autoResumeParentRef`, `sendDepsRef`.

Delete `sendAgentSim` and `sendWorkflowSim` as separate functions — replace with a single `sendSimulation` that uses the machine state to decide what to send.

- [ ] **Step 4: Delete useSimulationComposition.ts**

Remove the file entirely. All its logic is now in the machine.

- [ ] **Step 5: Update SimulationState interface**

Add `compositionStack: CompositionLevel[]` and `compositionPhase: string` from the machine state to the return value. Read from `comp.stack` and `comp.phase`.

- [ ] **Step 6: Verify**

Run: `npm run check -w packages/web`
Run: `npm run test -w packages/web -- --testPathPatterns=compositionMachine`
Run: `npm run test -w packages/web -- --testPathPatterns=useCompositionStack`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git rm packages/web/app/hooks/useSimulationComposition.ts
git add packages/web/app/hooks/useSimulation.ts packages/web/app/hooks/useSimulationState.ts packages/web/app/hooks/useSimulationHelpers.ts
git commit -m "refactor: replace ref-heavy composition hooks with state machine + useSyncExternalStore"
```

---

### Task B4: Update UI components

**Files:**
- Modify: `packages/web/app/components/panels/simulation/SimulationPanel.tsx`
- Modify: `packages/web/app/components/GraphBuilder.tsx`
- Modify: `packages/web/app/components/GraphCanvas.tsx`

- [ ] **Step 1: Update SimulationPanel**

Read `compositionStack` from `simulation.compositionStack` (which now comes from the machine state). The breadcrumb and child_start/child_end entries work unchanged — they read from the same data shape.

- [ ] **Step 2: Update GraphBuilder and GraphCanvas**

Pass `compositionStack` from `simulation.compositionStack` to `SimulationPanel`. This should already work if the `SimulationState` interface includes `compositionStack`.

- [ ] **Step 3: Verify**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/simulation/SimulationPanel.tsx packages/web/app/components/GraphBuilder.tsx packages/web/app/components/GraphCanvas.tsx
git commit -m "refactor: update UI components to use machine state"
```

---

### Task B5: Final verification

- [ ] **Step 1: Run all checks**

Run: `npm run check`
Expected: format + lint + typecheck all pass

- [ ] **Step 2: Run all tests**

Run: `npm run test -w packages/api`
Run: `npm run test -w packages/backend`
Run: `npm run test -w packages/web -- --testPathPatterns=compositionMachine`
Run: `npm run test -w packages/web -- --testPathPatterns=useCompositionStack`
Expected: All pass

- [ ] **Step 3: Verify no dead refs/imports**

Run: `grep -r "compositionStackRef\|messagesRef\|pendingChildRef\|pendingParentResumeRef\|autoResumeParentRef\|sendDepsRef\|useSimulationComposition" packages/web/app/ --include="*.ts" --include="*.tsx" -l`
Expected: No files (all refs removed, old file deleted)

- [ ] **Step 4: Verify dead code removed**

Run: `grep -r "simulateWorkflowDispatch" packages/backend/src/ --include="*.ts" -l`
Expected: No files
