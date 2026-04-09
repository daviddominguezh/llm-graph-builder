# Simulation Composition Part 2: Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the composition stack pure functions (making Part 1 tests pass), backend orchestrator with SSE event streaming, child config resolution, and frontend wiring for the simulation panel.

**Architecture:** Frontend holds the composition stack (pure functions in `useCompositionStack.ts`). Backend is stateless — receives state per request, runs one execution at the specified depth, streams events with `depth` field. When a dispatch sentinel is detected, the backend runs the child in-process within the same SSE stream. After child finishes, it injects the child output as a tool result into the parent's messages and calls `executeAgentLoop` again with the updated messages. This is NOT replay — the LLM sees the full conversation history (including the tool call + tool result) and makes one new call to continue. The orchestrator tracks cumulative step counts and tokens externally since each `executeAgentLoop` call resets its internal accumulators.

**Tech Stack:** TypeScript, React, Express, Jest, AI SDK (`ai` package), Supabase

**Spec:** `docs/superpowers/specs/2026-04-08-simulation-composition-part2-implementation.md`

**Prerequisite:** Part 1 tests are written and failing (red).

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `packages/web/app/hooks/useCompositionStack.ts` | Pure composition stack functions (replaces stubs from Part 1) |
| `packages/backend/src/routes/simulationOrchestratorTypes.ts` | Types/interfaces for orchestrator (config, callbacks, result) |
| `packages/backend/src/routes/simulationOrchestratorHelpers.ts` | Helper functions: tool result injection, message building, depth checks |
| `packages/backend/src/routes/simulationOrchestrator.ts` | Main orchestrator entry: recursive composition execution |
| `packages/backend/src/routes/simulateChildResolver.ts` | Resolve child config from dispatch params (DB lookups, tool inheritance) |
| `packages/web/app/hooks/useSimulationComposition.ts` | Composition-specific hooks and callback builders (extracted from useSimulation.ts to stay under line limit) |

### Modified files

| File | Changes |
|------|---------|
| `packages/backend/src/routes/simulateAgentTypes.ts` | Add `depth` to existing events, 3 new event types, `SimulationComposition` schema, `orgId` to request |
| `packages/backend/src/routes/simulateAgentSse.ts` | Add `depth` param to writers, new event writers, keepalive |
| `packages/backend/src/routes/simulateAgentHandler.ts` | Parse `composition`, delegate to orchestrator, abort signal, create Supabase client |
| `packages/web/app/lib/api.ts` | Parse new SSE events, add `depth` to `SseEventSchema`, rename `onChildDispatched`→`onSimChildDispatched` to avoid conflict |
| `packages/web/app/lib/agentSimulationApi.ts` | Add `composition` and `orgId` to request body |
| `packages/web/app/hooks/useSimulationState.ts` | Add `compositionStack` to state |
| `packages/web/app/hooks/useSimulation.ts` | Import composition hooks, wire into send/start/clear |
| `packages/web/app/hooks/useSimulationHelpers.ts` | Add `setCompositionStack` to `SimulationSetters`/`FullSetters` |
| `packages/web/app/components/panels/simulation/SimulationPanel.tsx` | Breadcrumb from composition depth |
| `packages/web/app/api/simulate/route.ts` | Increase timeout for composition, pass `orgId` through, pass `composition` through |

---

## Key Design Decisions (addressing review findings)

### Parent loop resumption (NOT replay)

When a child finishes, the orchestrator:
1. Injects child output as a tool result message into the parent's accumulated messages
2. Calls `executeAgentLoop` again with the updated messages (all previous messages + tool result)
3. The LLM sees the complete conversation including `tool-call` + `tool-result` and makes ONE new call to decide what to do next
4. This is NOT replay — the LLM does not re-execute previous tool calls because the results are already in the history
5. The orchestrator tracks cumulative `totalTokens` and `steps` across all `executeAgentLoop` calls at the same depth

### Supabase client access

The simulate-agent handler uses `createServiceClient()` (same as `executeChildHandler.ts`). The request body gains an `orgId` field. The Next.js route (`/api/simulate/route.ts`) extracts `orgId` from the authenticated user's session and includes it in the forwarded request. All child resolver DB queries filter by `org_id`.

### ESLint compliance

The orchestrator is split into 3 files to stay under 300 lines each:
- `simulationOrchestratorTypes.ts` — interfaces (~40 lines)
- `simulationOrchestratorHelpers.ts` — tool result injection, depth checks, message building (~80 lines)
- `simulationOrchestrator.ts` — main recursive function (~120 lines, functions under 40 lines each)

Frontend composition logic is extracted into `useSimulationComposition.ts` to keep `useSimulation.ts` under 300 lines.

### Abort signal

Currently `executeAgentLoop` does NOT accept an `AbortSignal`. Adding it is out of scope for this plan. The orchestrator checks the abort signal between steps (between child dispatch and child execution, between child completion and parent resume). In-flight LLM calls cannot be aborted. This is documented as a known limitation.

### SSE callback naming

The existing `onChildDispatched` callback in `StreamCallbacks` (for the execution API) has a different shape than the simulation's. The simulation adds `onSimChildDispatched`, `onSimChildFinished`, `onSimChildWaiting` with the `Sim` prefix to avoid conflicts. The existing execution API callbacks remain unchanged.

### Token accounting

Only `step_processed` events contribute to token totals. The `child_finished` event's `tokens` field is informational (aggregate for that child). The frontend accumulates tokens from `step_processed` events using the `depth` field, storing per-depth and aggregate totals via `accumulateDepthTokens`. No double-counting.

### Next.js proxy timeout

The `/api/simulate/route.ts` timeout is increased from 30s to 300s for composition scenarios. The `composition` field is passed through to the backend unchanged.

---

### Task 1: Implement useCompositionStack.ts — make Part 1 tests pass

**Files:**
- Modify: `packages/web/app/hooks/useCompositionStack.ts` (replace stubs with real implementation)

- [ ] **Step 1: Replace the stub file with real implementation**

Replace all function bodies (not the types — those stay the same from the stub). Key implementation details:

- `pushChild`: Create a user message from `task`, create a new `CompositionLevel` with `messages: [taskMessage]`, `parentMessages: [...params.parentMessages]` (shallow copy to snapshot), append to stack. Return new stack (never mutate input).

- `popChild`: If stack is empty, return `{ stack: [], rootMessages }` unchanged. Otherwise remove last entry. Build a tool result message: `{ role: 'tool', content: [{ type: 'tool-result', toolCallId: poppedEntry.parentToolCallId, toolName: poppedEntry.toolName, output: { type: 'text', value: childOutput } }] }`. If new stack is empty, inject into `rootMessages`. If new stack has entries, inject into the new top entry's `messages`. Return new state.

- `getActiveDepth`: `return stack.length`

- `getActiveMessages`: If stack empty return `rootMessages`. Otherwise `return stack[stack.length - 1].messages`.

- `appendUserMessage`: Create a user message. If stack empty, return `{ stack, rootMessages: [...rootMessages, msg] }`. Otherwise clone the stack, replace last entry's messages with `[...lastEntry.messages, msg]`, return `{ stack: newStack, rootMessages }`.

- `buildCompositionPayload`: If stack empty return `undefined`. Otherwise build `SimulationComposition` from each level's stored `parentMessages`, `parentToolCallId`, `appType`, `currentNodeId`, `structuredOutputs`.

- `createEmptyDepthTokens`: Return `{ byDepth: {}, aggregate: { input: 0, output: 0, cached: 0 } }`.

- `accumulateDepthTokens`: Create new `byDepth` with depth entry accumulated, create new `aggregate` by summing all byDepth entries. Return new object (immutable).

- [ ] **Step 2: Run Part 1 tests**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack --verbose`
Expected: ALL tests PASS. If any fail, fix the implementation (NEVER the tests).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useCompositionStack.ts
git commit -m "feat: implement useCompositionStack pure functions — all Part 1 tests pass"
```

---

### Task 2: Backend SSE types — depth, composition events, request changes

**Files:**
- Modify: `packages/backend/src/routes/simulateAgentTypes.ts`

- [ ] **Step 1: Add `depth` to existing event types**

Add `depth?: number` to: `AgentStepStartedEvent`, `AgentStepProcessedEvent`, `AgentToolExecutedEvent`, `AgentResponseEvent`.

- [ ] **Step 2: Add new composition event types**

```typescript
export interface ChildDispatchedEvent {
  type: 'child_dispatched';
  depth: number;
  parentDepth: number;
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  task: string;
  parentToolCallId: string;
  toolName: string;
}

export interface ChildFinishedEvent {
  type: 'child_finished';
  depth: number;
  output: string;
  status: 'success' | 'error';
  tokens: { input: number; output: number; cached: number; costUSD?: number };
}

export interface ChildWaitingEvent {
  type: 'child_waiting';
  depth: number;
  text: string;
}
```

Note: `ChildDispatchedEvent` includes `parentToolCallId` and `toolName` so the frontend's `pushChild` has all the data it needs.

- [ ] **Step 3: Update union type**

Add the 3 new events to `AgentSimulationEvent`.

- [ ] **Step 4: Add SimulationComposition and orgId to request schema**

Add `composition` (optional) and `orgId` (string) to both the Zod schema and the `SimulateAgentRequest` interface.

- [ ] **Step 5: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/simulateAgentTypes.ts
git commit -m "feat: add depth to SSE events, composition event types, orgId and composition to request"
```

---

### Task 3: Backend SSE writers — depth parameter and new event writers

**Files:**
- Modify: `packages/backend/src/routes/simulateAgentSse.ts`

- [ ] **Step 1: Add depth to existing writer functions**

Add optional `depth = 0` parameter to `sendStepStarted`, `sendStepProcessed`, `sendToolExecuted`, `sendAgentResponse`. Include `depth` in each event payload.

- [ ] **Step 2: Add new event writers and keepalive**

Add: `sendChildDispatched`, `sendChildFinished`, `sendChildWaiting`, `sendKeepAlive`.

`sendKeepAlive` writes `: keepalive\n\n` (SSE comment) and flushes.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/simulateAgentSse.ts
git commit -m "feat: add depth param to SSE writers, composition event writers, keepalive"
```

---

### Task 4: Backend child resolver

**Files:**
- Create: `packages/backend/src/routes/simulateChildResolver.ts`

- [ ] **Step 1: Create the resolver**

Key function: `resolveChildConfig(supabase, dispatchType, params, parentTools, orgId)`.

For `invoke_agent`:
- Query `agent_versions` by slug + version + org_id
- Extract `systemPrompt`, `model`, `contextItems`, `mcpServers` from `graph_data`
- Merge context items: agent's own first, then parent-provided
- Tool inheritance: if `params.tools === 'all'`, merge parent tools. If array, filter parent tools to named ones.
- Call `injectSystemTools({ existingTools, isChildAgent: true })`

For `create_agent`:
- Build config directly from inline params
- Tool inheritance same rules

For `invoke_workflow`:
- Query `agent_versions` by slug + version + org_id
- Return the graph data for workflow execution

All queries filter by `org_id`. Use `createServiceClient()` for DB access.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/simulateChildResolver.ts
git commit -m "feat: add simulateChildResolver for resolving child agent/workflow configs"
```

---

### Task 5: Backend orchestrator (3 files)

**Files:**
- Create: `packages/backend/src/routes/simulationOrchestratorTypes.ts`
- Create: `packages/backend/src/routes/simulationOrchestratorHelpers.ts`
- Create: `packages/backend/src/routes/simulationOrchestrator.ts`

- [ ] **Step 1: Create orchestrator types**

Create `simulationOrchestratorTypes.ts` with interfaces:
- `OrchestratorConfig` — body, session, depth, maxNestingDepth, orgId, supabase, abortSignal
- `OrchestratorCallbacks` — typed event emitters for all SSE events (steps, tools, composition lifecycle)
- `OrchestratorResult` — union: `{ type: 'completed' }` | `{ type: 'child_waiting'; depth; text }`

- [ ] **Step 2: Create orchestrator helpers**

Create `simulationOrchestratorHelpers.ts` with:
- `buildToolResultMessage(parentToolCallId, toolName, output)` — creates an AI SDK format tool result `Message`
- `injectToolResultIntoMessages(messages, toolResultMsg)` — returns `[...messages, toolResultMsg]`
- `checkDepthLimit(currentDepth, maxDepth)` — returns error string if exceeded, null if ok
- `extractTaskFromParams(dispatchType, params)` — gets the `task` or `user_said` string from dispatch params

- [ ] **Step 3: Create main orchestrator**

Create `simulationOrchestrator.ts` with the main function `runSimulationOrchestration(config, callbacks)`.

Logic (each step is a separate extracted function to stay under 40 lines):

1. `runAtDepth(config, callbacks)`:
   - Call `executeAgentLoop` with callbacks that prefix `depth`
   - Check result for `dispatchResult` → call `handleDispatch`
   - Check result for `finishResult` → return `{ type: 'completed' }`
   - No dispatch, no finish → return `{ type: 'completed' }` (normal agent response)

2. `handleDispatch(config, callbacks, parentResult, parentMessages)`:
   - Check depth limit → if exceeded, inject error tool result, re-run parent
   - Emit `child_dispatched`
   - Resolve child config via `resolveChildConfig`
   - Create child MCP session in try/finally
   - Recursively call `runAtDepth` for child at `depth + 1`
   - If child returns `completed` with `finishResult`: emit `child_finished`, inject output into parent messages, call `executeAgentLoop` again with updated messages (parent continues)
   - If child returns `completed` without `finishResult` (needs user input): emit `child_waiting`, return
   - If child returns `child_waiting`: propagate up
   - Close child MCP session in finally

3. `handleChildError(err, config, callbacks, parentMessages)`:
   - Emit `child_finished(status:'error', output: err.message)`
   - Inject error tool result into parent messages
   - Call `executeAgentLoop` again with updated parent messages

Token tracking: the orchestrator accumulates `totalTokens` across multiple `executeAgentLoop` calls at the same depth by summing the results externally.

- [ ] **Step 4: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/simulationOrchestratorTypes.ts \
       packages/backend/src/routes/simulationOrchestratorHelpers.ts \
       packages/backend/src/routes/simulationOrchestrator.ts
git commit -m "feat: add simulationOrchestrator for recursive in-process composition"
```

---

### Task 6: Backend handler — wire orchestrator

**Files:**
- Modify: `packages/backend/src/routes/simulateAgentHandler.ts`

- [ ] **Step 1: Update handler**

Changes:
1. Import `createServiceClient` from `../../db/queries/executionAuthQueries.js`
2. Parse `composition` and `orgId` from request body
3. Determine `depth` from `composition?.depth ?? 0`
4. Create `AbortController`, listen for `req.on('close', () => controller.abort())`
5. Create Supabase client: `const supabase = createServiceClient()`
6. Build orchestrator callbacks that call SSE writers with correct `depth`
7. Call `runSimulationOrchestration(config, callbacks)` instead of `runAgentSimulation`
8. If result is `child_waiting`: stream event, end response
9. If result is `completed`: stream `agent_response` at depth 0 (only for root), end response
10. All MCP sessions closed in finally (unchanged pattern)

Keep the handler thin — delegate to orchestrator.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/simulateAgentHandler.ts
git commit -m "feat: wire simulateAgentHandler to orchestrator with composition and orgId"
```

---

### Task 7: Frontend SSE parsing — new event types

**Files:**
- Modify: `packages/web/app/lib/api.ts`

- [ ] **Step 1: Add new callbacks with Sim prefix (avoid conflict with existing execution API callbacks)**

Add to `StreamCallbacks`:

```typescript
onSimChildDispatched?: (event: {
  depth: number; parentDepth: number; dispatchType: string;
  task: string; parentToolCallId: string; toolName: string;
}) => void;
onSimChildFinished?: (event: {
  depth: number; output: string; status: string;
  tokens: { input: number; output: number; cached: number };
}) => void;
onSimChildWaiting?: (event: { depth: number; text: string }) => void;
```

- [ ] **Step 2: Add dispatch handlers in `dispatchSseEvent`**

```typescript
} else if (event.type === 'child_dispatched' && event.depth !== undefined) {
  callbacks.onSimChildDispatched?.(event);
} else if (event.type === 'child_finished' && event.depth !== undefined) {
  callbacks.onSimChildFinished?.(event);
} else if (event.type === 'child_waiting' && event.depth !== undefined) {
  callbacks.onSimChildWaiting?.(event);
}
```

- [ ] **Step 3: Add `depth` and new fields to `SseEventSchema`**

Add to the Zod schema: `depth: z.number().optional()`, `parentDepth: z.number().optional()`, `dispatchType: z.string().optional()`, `parentToolCallId: z.string().optional()`, `toolName: z.string().optional()`.

- [ ] **Step 4: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/api.ts
git commit -m "feat: parse simulation composition SSE events (child_dispatched/finished/waiting)"
```

---

### Task 8: Frontend agent simulation API — add composition and orgId

**Files:**
- Modify: `packages/web/app/lib/agentSimulationApi.ts`

- [ ] **Step 1: Add composition and orgId to request body type**

Add to `AgentSimulateRequestBody`:

```typescript
orgId?: string;
composition?: {
  depth: number;
  stack: Array<{
    appType: 'agent' | 'workflow';
    parentToolCallId: string;
    parentMessages: unknown[];
    parentCurrentNodeId?: string;
    parentStructuredOutputs?: Record<string, unknown[]>;
  }>;
};
```

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/lib/agentSimulationApi.ts
git commit -m "feat: add composition and orgId to agent simulation request body"
```

---

### Task 9: Frontend state — add compositionStack

**Files:**
- Modify: `packages/web/app/hooks/useSimulationState.ts`
- Modify: `packages/web/app/hooks/useSimulationHelpers.ts`

- [ ] **Step 1: Add compositionStack to state**

In `useSimulationState.ts`:
1. Import `CompositionLevel` from `./useCompositionStack`
2. Add `compositionStack: CompositionLevel[]` to `CoreStateValues`
3. Add `setCompositionStack: React.Dispatch<React.SetStateAction<CompositionLevel[]>>` to `CoreDispatchers`
4. Add `useState<CompositionLevel[]>([])` in `useSimCoreState`
5. Add to `SimulationHookState` interface
6. Wire through return objects

- [ ] **Step 2: Add `setCompositionStack` to SimulationSetters**

In `useSimulationHelpers.ts`:
1. Import `CompositionLevel` from `./useCompositionStack`
2. Add `setCompositionStack: React.Dispatch<React.SetStateAction<CompositionLevel[]>>` to `SimulationSetters`

This makes `setCompositionStack` available to callback builders.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useSimulationState.ts packages/web/app/hooks/useSimulationHelpers.ts
git commit -m "feat: add compositionStack to simulation state and setters"
```

---

### Task 10: Frontend composition hook — extracted module

**Files:**
- Create: `packages/web/app/hooks/useSimulationComposition.ts`

- [ ] **Step 1: Create the composition hook module**

This module contains the callback builders for composition events. Extracted from `useSimulation.ts` to keep both under 300 lines.

Key exports:
- `buildCompositionCallbacks(setters, compositionStack)` — returns the `onSimChildDispatched`, `onSimChildFinished`, `onSimChildWaiting` callbacks that call `pushChild`/`popChild` and update state via `setters.setCompositionStack` and `setters.setMessages`
- `buildCompositionSendParams(compositionStack, rootMessages, orgId)` — returns `{ messages, composition }` for the request when depth > 0

Uses refs (passed as params) for the composition stack to avoid stale closure captures.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/useSimulationComposition.ts
git commit -m "feat: add useSimulationComposition for composition callback builders"
```

---

### Task 11: Frontend wiring — integrate into useSimulation

**Files:**
- Modify: `packages/web/app/hooks/useSimulation.ts`

- [ ] **Step 1: Wire composition into the simulation flow**

1. Import from `useSimulationComposition`
2. In `sendAgentSimulation`: check `getActiveDepth(compositionStack)`. If > 0, use child's messages and include composition payload. Use `appendUserMessage` from composition stack.
3. Merge composition callbacks into `buildStreamCallbacks` return value
4. In `useSimulationClear`: add `setters.setCompositionStack([])`
5. In `useSimulationStart`: add `setters.setCompositionStack([])`
6. Add `compositionStack` to `SimulationState` interface and return value

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/useSimulation.ts
git commit -m "feat: wire composition stack into simulation send/start/clear flows"
```

---

### Task 12: Frontend UI — breadcrumb in SimulationPanel

**Files:**
- Modify: `packages/web/app/components/panels/simulation/SimulationPanel.tsx`

- [ ] **Step 1: Add breadcrumb display**

Import `CompositionLevel`. Derive breadcrumb items from `simulation.compositionStack`:
- `'Root'` as first item
- Each stack entry: use `String(level.dispatchParams.agentSlug ?? level.dispatchParams.workflowSlug ?? 'Child ' + String(i + 1))`

Render only when depth > 0. Use `ChevronRight` icon between items. Last item bold/foreground, previous items muted.

- [ ] **Step 2: Add translations**

Add breadcrumb-related strings to `messages/en.json`.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/simulation/SimulationPanel.tsx packages/web/messages/en.json
git commit -m "feat: add composition breadcrumb to SimulationPanel"
```

---

### Task 13: Next.js proxy route — timeout and passthrough

**Files:**
- Modify: `packages/web/app/api/simulate/route.ts`

- [ ] **Step 1: Increase timeout**

Change `UPSTREAM_TIMEOUT_MS` from `30_000` to `300_000` (5 minutes) for composition scenarios.

- [ ] **Step 2: Pass orgId through**

Extract `orgId` from the authenticated session and include it in the forwarded request body.

- [ ] **Step 3: Verify composition field passes through**

The `composition` field from the frontend request body must pass through to the backend unchanged. Verify that the body forwarding logic doesn't strip it (check if there's explicit field picking or if the full body is forwarded).

- [ ] **Step 4: Verify**

Run: `npm run check -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/api/simulate/route.ts
git commit -m "feat: increase simulate timeout for composition, pass orgId and composition through"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run all checks**

Run: `npm run check`
Expected: format + lint + typecheck all pass across all packages.

- [ ] **Step 2: Run Part 1 tests**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack --verbose`
Expected: ALL tests PASS.

- [ ] **Step 3: Verify no regressions**

Run: `npm run test -w packages/api`
Run: `npm run test -w packages/backend`
Expected: All existing tests pass.

- [ ] **Step 4: Verify no leftover references**

Run: `grep -r "FlatTool" packages/web/app/ --include="*.ts" --include="*.tsx" -l`
Expected: No files (cleaned up in tool registry work).
