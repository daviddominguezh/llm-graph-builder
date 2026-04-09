# Simulation Composition — Part 2: Implementation

## Overview

This is Part 2 of the Simulation Composition spec. Part 1 defines the test suite (behavioral contract). This part covers the implementation that satisfies those tests, plus the backend orchestration and frontend UI wiring.

**Prerequisite:** All tests from Part 1 must be written and failing (red) before any implementation in this part begins.

## Frontend Implementation

### useCompositionStack.ts

`packages/web/app/hooks/useCompositionStack.ts`

Pure functions that manage the `CompositionLevel[]` stack. No React hooks, no side effects. This is the module tested by Part 1's test suite. Functions:

- `pushChild(stack, params)` → new stack with child level appended
- `popChild(stack, rootMessages, childOutput, childStatus)` → `{ stack, rootMessages }` with child removed and output injected as tool result
- `getActiveDepth(stack)` → number (0 = root)
- `getActiveMessages(stack, rootMessages)` → the active level's message array
- `appendUserMessage(stack, rootMessages, text)` → `{ stack, rootMessages }` with user message appended to active level
- `buildCompositionPayload(stack, rootMessages)` → `SimulationComposition | undefined`

All functions are immutable — input stack is never mutated, new stack is returned.

### useSimulation.ts integration

`packages/web/app/hooks/useSimulation.ts`

Add `compositionStack` state via `useState<CompositionLevel[]>([])`. Wire the composition functions into the simulation flow:

- On `child_dispatched` SSE event: call `pushChild`, update stack state
- On `child_waiting` SSE event: no state change (the stack already has the active child)
- On `child_finished` SSE event: call `popChild`, update stack and root messages
- On user send: call `getActiveDepth` to decide whether to send root or child state. Call `appendUserMessage` to add user message to the correct level. Call `buildCompositionPayload` to attach composition context to the request.
- On simulation clear/reset: reset stack to `[]`

### useSimulationState.ts

`packages/web/app/hooks/useSimulationState.ts`

Add `compositionStack: CompositionLevel[]` to the simulation state interface. Add `setCompositionStack` setter.

### agentSimulationApi.ts

`packages/web/app/lib/agentSimulationApi.ts`

When `buildCompositionPayload` returns a non-undefined value, include it in the request body as `composition`. The active level's messages become the request's `messages` field. The active level's `systemPrompt` / `modelId` come from the resolved child config (passed via the composition payload).

### SimulationPanel.tsx

`packages/web/app/components/panels/simulation/SimulationPanel.tsx`

- Show breadcrumb derived from composition stack depth (e.g., `Root > recipe-bot > ...`)
- Group conversation entries by depth using the `depth` field from SSE events
- Token display shows per-depth breakdown and aggregate total

### api.ts SSE parsing

`packages/web/app/lib/api.ts`

Add handlers for new SSE event types:
- `child_dispatched` → call `onChildDispatched` callback
- `child_finished` → call `onChildFinished` callback
- `child_waiting` → call `onChildWaiting` callback

Existing events (`step_started`, `step_processed`, `tool_executed`, `agent_response`) now include optional `depth` field — pass it through to callbacks.

## Backend Implementation

### simulateAgentTypes.ts

`packages/backend/src/routes/simulateAgentTypes.ts`

Add `depth` field (optional, default 0) to all existing event types. Add new event types:

```typescript
interface ChildDispatchedEvent {
  type: 'child_dispatched';
  depth: number;
  parentDepth: number;
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  task: string;
}

interface ChildFinishedEvent {
  type: 'child_finished';
  depth: number;
  output: string;
  status: 'success' | 'error';
  tokens: { input: number; output: number; cached: number; costUSD?: number };
}

interface ChildWaitingEvent {
  type: 'child_waiting';
  depth: number;
  text: string;
}
```

Add `SimulationComposition` schema to the request:

```typescript
interface SimulationComposition {
  depth: number;
  stack: Array<{
    appType: 'agent' | 'workflow';
    parentToolCallId: string;
    parentMessages: Message[];
    parentCurrentNodeId?: string;
    parentStructuredOutputs?: Record<string, unknown[]>;
  }>;
}
```

### simulateAgentSse.ts

`packages/backend/src/routes/simulateAgentSse.ts`

Add `depth` parameter to existing SSE writer functions. Add new writer functions for `child_dispatched`, `child_finished`, `child_waiting`. Suppress `agent_response` for non-zero depths.

SSE keepalive: send `: keepalive\n\n` comments during long operations to prevent reverse proxy timeouts.

### simulationOrchestrator.ts (new)

`packages/backend/src/routes/simulationOrchestrator.ts`

The orchestrator receives config + event callbacks (not `Response`). It:

1. Runs `executeAgentLoop` (or `executeWithCallbacks` for workflows)
2. If result has `dispatchResult`: emits `child_dispatched`, resolves child config, runs child in-process recursively
3. If child returns `finishResult`: emits `child_finished`, injects output as tool result into parent messages, resumes parent loop
4. If child returns text without `finish`: emits `child_waiting`, returns control (SSE stream closes, frontend handles next user message)
5. Wraps each child execution in try/catch — child failure becomes `child_finished(status:'error')` + error tool result for parent
6. Enforces `maxNestingDepth` before each dispatch
7. Manages MCP session lifecycle for children (create in try, close in finally)

The orchestrator is a pure async function, testable without Express.

### simulateChildResolver.ts (new)

`packages/backend/src/routes/simulateChildResolver.ts`

Resolves child config from dispatch params. Requires a Supabase client for DB access.

- `invoke_agent`: fetch `agent_versions.graph_data` by slug+version, filtered by `org_id`. Extract systemPrompt, model, contextItems, mcpServers. Merge parent-provided contextItems.
- `create_agent`: build config from inline params (systemPrompt, task, model, tools, contextItems).
- `invoke_workflow`: fetch published workflow graph by slug+version, filtered by `org_id`.

Tool inheritance:
- `tools: "all"` → child gets parent's MCP tools merged with its own
- `tools: ["specific"]` → child gets only named tools from parent
- In all cases: `injectSystemTools({ existingTools, isChildAgent: true })`

### simulateAgentHandler.ts

`packages/backend/src/routes/simulateAgentHandler.ts`

Stays thin. Changes:
- Parse `composition` from request body
- If `composition` present: delegate to orchestrator at the specified depth
- If absent: current behavior (depth 0 root execution)
- Listen for `req.on('close')` → propagate abort signal via `AbortController`
- All MCP sessions (parent + children) closed in `finally`

## Error Handling

1. **Child throws**: Catch, emit `child_finished(status:'error', output: error.message)`, inject error as tool result, resume parent.
2. **Child MCP session fails**: Same treatment — error becomes tool result.
3. **Client disconnect**: `req.on('close')` propagates `AbortController.abort()`. Cascades to all active children. All MCP sessions closed in `finally`.
4. **Partial completion**: Child finished events already streamed. Parent failure emitted as `error` event.

## Security

1. **Org-scoped queries**: Child resolver filters by `org_id`.
2. **API key inheritance**: Children use parent's API key.
3. **create_agent sandboxing**: Dynamic agents sandboxed to parent's key, sessions, org.

## Files Summary

### New files

| File | Purpose |
|------|---------|
| `packages/web/app/hooks/useCompositionStack.ts` | Pure composition stack functions (tested by Part 1) |
| `packages/backend/src/routes/simulationOrchestrator.ts` | Recursive in-process composition execution |
| `packages/backend/src/routes/simulateChildResolver.ts` | Resolve child config from dispatch params |

### Modified files

| File | Changes |
|------|---------|
| `packages/backend/src/routes/simulateAgentHandler.ts` | Thin delegation to orchestrator, abort signal |
| `packages/backend/src/routes/simulateAgentSse.ts` | `depth` on all events, new event writers, keepalive |
| `packages/backend/src/routes/simulateAgentTypes.ts` | New event types, `SimulationComposition` schema |
| `packages/web/app/hooks/useSimulation.ts` | Composition stack state, SSE event handling |
| `packages/web/app/hooks/useSimulationState.ts` | Add composition stack to state |
| `packages/web/app/lib/agentSimulationApi.ts` | Send composition payload |
| `packages/web/app/lib/api.ts` | Parse new SSE events with depth |
| `packages/web/app/components/panels/simulation/SimulationPanel.tsx` | Breadcrumb, depth grouping |

## Implementation Order

| Phase | What |
|-------|------|
| 1 | Implement `useCompositionStack.ts` — make Part 1 tests pass |
| 2 | Backend types: SSE events with `depth`, `SimulationComposition` schema |
| 3 | Backend: `simulateChildResolver.ts`, `simulationOrchestrator.ts` |
| 4 | Backend: update `simulateAgentHandler.ts` and SSE writers |
| 5 | Frontend: wire `useSimulation.ts`, `agentSimulationApi.ts`, `api.ts` |
| 6 | Frontend: `SimulationPanel.tsx` breadcrumb and depth grouping |
