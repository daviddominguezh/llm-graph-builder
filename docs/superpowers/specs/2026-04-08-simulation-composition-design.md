# Simulation Composition — Design Spec (Superseded)

> **This spec has been split into two parts:**
> - **Part 1 (Tests):** `2026-04-08-simulation-composition-part1-tests.md` — TDD contract tests for composition stack state management
> - **Part 2 (Implementation):** `2026-04-08-simulation-composition-part2-implementation.md` — Backend orchestrator, frontend wiring, SSE events
>
> **Key architectural correction:** The composition stack state management (message history per depth, push/pop, tool result injection) lives in the **frontend**, not the backend. The backend is stateless — it receives messages + composition context per request, runs one execution, streams events. The frontend is the source of truth for nesting state.

## Problem

The simulation panel does not support agent/workflow composition. When an agent calls `invoke_agent`, `create_agent`, or `invoke_workflow` during simulation, the dispatch sentinel is detected but silently dropped — the child never runs, no error is shown.

The execution API handles composition via an event-driven serverless model (stack table, HTTP dispatch, pending_resumes worker). Simulation cannot use any of that infrastructure — it runs in-process on a single HTTP request with no database persistence.

## Goal

Enable full composition in the simulation panel with:
- In-process child execution (agent or workflow) within the same SSE stream
- Multi-turn children (child can ask user for input, user responds, child continues)
- N-depth nesting (parent → child → grandchild → ...)
- Full event visibility at every depth (steps, tool calls, node visits)
- Per-depth and aggregate token tracking

## Key Insight: Message History IS the State

There is no "replay." LLM state is the message history. Workflow state is message history + `currentNodeId`. The frontend maintains a composition stack of `{ appType, messages, currentNodeId? }` per depth level. Each request sends the active level's state. The backend always knows exactly where to continue.

## Execution Model

### Single-turn flow (child doesn't need user input)

1. Parent agent loop runs, calls `invoke_agent`, returns `dispatchResult`.
2. Simulation handler intercepts. Resolves child config:
   - `invoke_agent`: fetch published agent by slug/version from DB.
   - `create_agent`: build config from inline dispatch params.
   - `invoke_workflow`: fetch published workflow graph by slug/version.
3. Runs child in-process: `executeAgentLoop(childConfig, callbacks)` with `isChildAgent=true`. For workflow children: `executeWithCallbacks(childGraph, ...)`.
4. Child's steps/tool calls stream as SSE events with `depth: 1`.
5. Child calls `finish` → returns `finishResult`.
6. Handler injects child output as synthetic tool result into parent's message history.
7. Resumes parent loop from that point — parent continues with the tool result in its messages.
8. All happens within a single SSE stream / HTTP request.

### Multi-turn flow (child needs user input)

1. Same as above through step 4.
2. Child produces text without calling `finish` (loop ends, no more tool calls) — child is asking the user something.
3. Handler streams `child_waiting` event with `depth: 1` and closes the SSE response.
4. Frontend maintains a composition stack: an array of `{ appType, messages, currentNodeId? }` per depth level.
5. User types a reply. Frontend appends user message to depth 1's messages. Sends new request with depth 1's state.
6. Backend receives the request, sees the composition context, knows to continue the child (not the parent).
7. Child loop runs with the updated messages. Eventually calls `finish`.
8. Handler streams `child_finished` event, injects output into parent's messages.
9. Continues parent or returns to frontend if parent also needs input.

### N-depth nesting

Same pattern recursively. If the child dispatches a grandchild, the composition stack grows to depth 2. The frontend always sends the active (deepest) level's state. Each level's state is just `{ appType, messages, currentNodeId? }`.

### Token tracking

Each child's `AgentLoopResult.totalTokens` is streamed per-depth in SSE events. The frontend accumulates per-depth totals and a grand total across the full tree.

## SSE Events

All existing events (`step_started`, `step_processed`, `tool_executed`, `agent_response`) gain a `depth: number` field. Depth 0 = root, 1 = first child, etc. No new event types needed for steps/tools — the depth field is sufficient for the frontend to group and render them.

New events for composition lifecycle:

| Event | When | Payload |
|-------|------|---------|
| `child_dispatched` | Parent's dispatch sentinel detected, child about to start | `{ depth, parentDepth, dispatchType, task }` |
| `child_finished` | Child returned `finishResult` | `{ depth, output, status, tokens }` |
| `child_waiting` | Child produced text without `finish` (needs user input) | `{ depth, text }` |

The `agent_response` event is only emitted at depth 0 to signal root completion. For child executions, `agent_response` is NOT emitted — only `child_finished` is sent. This avoids duplication and makes the event stream unambiguous.

The handler sends SSE keepalive comments (`: keepalive\n\n`) during long LLM calls to prevent reverse proxy timeouts.

## Frontend Composition Stack

The simulation hook (`useSimulation`) maintains a `compositionStack`:

```typescript
interface CompositionLevel {
  appType: 'agent' | 'workflow';
  messages: Message[];
  currentNodeId?: string;                          // workflows only
  structuredOutputs?: Record<string, unknown[]>;   // workflows only
  dispatchParams: Record<string, unknown>;         // what the parent passed
  parentToolCallId: string;                        // to inject child output back as tool result
}
```

- Stack starts empty (depth 0 is the root, managed by existing state).
- On `child_dispatched`: push a new `CompositionLevel` with the child's initial state (task as first user message).
- On `child_waiting`: user input routes to the active (deepest) level. User's message appends to that level's `messages`.
- On `child_finished`: pop the stack, inject child output into the parent level's messages as a synthetic tool result using `parentToolCallId`.
- Breadcrumb: derived from the stack depth. Shows `Root > Child Agent > ...` like `ExecutionBreadcrumb` does for the execution API.

When sending a request, the frontend sends the active level's state. The backend request body gains a `composition` field so the handler knows the current nesting context.

## Backend Request Changes

The `SimulateAgentRequest` schema gains an optional `composition` field:

```typescript
interface SimulationComposition {
  depth: number;
  stack: Array<{
    appType: 'agent' | 'workflow';
    parentToolCallId: string;
    parentMessages: Message[];              // opaque — frontend must store/replay verbatim
    parentCurrentNodeId?: string;
    parentStructuredOutputs?: Record<string, unknown[]>;
  }>;
}
```

**Important:** `parentMessages` is an opaque blob. The frontend must store it exactly as received from the backend's SSE events and replay it verbatim without mutation, reformatting, or deduplication. Any client-side modification would corrupt the parent's resumption state.

When `composition` is present:
- The handler knows this is a child continuation, not a fresh root execution.
- `depth > 0` means the request's `messages`/`systemPrompt` are for the child at that depth.
- When the child finishes in-process, the handler uses `stack` entries to resume each parent level, working back up to depth 0 or until a level needs user input.

When `composition` is absent: current behavior, depth 0 root execution.

## Files

### Modified

| File | Changes |
|------|---------|
| `packages/backend/src/routes/simulateAgentHandler.ts` | Intercept `dispatchResult`, resolve child config, run child in-process, handle `finishResult` → resume parent |
| `packages/backend/src/routes/simulateAgentSse.ts` | Add `depth` to all events, add `child_dispatched`/`child_finished`/`child_waiting` event writers |
| `packages/backend/src/routes/simulateAgentTypes.ts` | Extend event types with `depth`, add composition event types, add `SimulationComposition` to request schema |
| `packages/web/app/hooks/useSimulation.ts` | Add `compositionStack` state, handle new SSE events, route user input to active depth |
| `packages/web/app/hooks/useSimulationState.ts` | Add composition stack to simulation state |
| `packages/web/app/lib/agentSimulationApi.ts` | Send `composition` field in request when stack is non-empty |
| `packages/web/app/lib/api.ts` | Parse new SSE event types (`child_dispatched`, `child_finished`, `child_waiting`) with `depth` |
| `packages/web/app/components/panels/simulation/SimulationPanel.tsx` | Show breadcrumb from composition stack, group events by depth |

### New

| File | Purpose |
|------|---------|
| `packages/backend/src/routes/simulateChildResolver.ts` | Resolve child config from dispatch params: fetch published agent/workflow by slug+version, build `AgentLoopConfig` |
| `packages/backend/src/routes/simulationOrchestrator.ts` | Recursive composition execution loop. Owns dispatch interception, child execution, parent resume. Accepts event emitter, not raw `Response`. |

The handler (`simulateAgentHandler.ts`) stays thin: parse request, create SSE writer, delegate to orchestrator, close. The orchestrator is a pure function that takes config + callbacks, making it testable without Express mocks.

## What Stays Unchanged

- `packages/api/src/agentLoop/agentLoop.ts` — already returns `dispatchResult`/`finishResult`, no changes needed.
- `packages/api/src/core/sentinelDetector.ts` — detection logic is complete.
- `packages/api/src/tools/systemToolInjector.ts` — `isChildAgent` flag and tool injection already work.
- The execution API path (stack table, pending_resumes, resume worker) — completely separate, not affected.

## Child Tool Inheritance

When a parent dispatches a child, the child needs tools. The resolver handles this based on dispatch type:

- **`invoke_agent`**: The published agent's own `mcpServers` are loaded from its `graph_data`. The parent's MCP session is NOT shared — the resolver creates a new MCP session from the child agent's configs. If the dispatch params include `tools: "all"`, the parent's MCP configs are also passed to the child (merged with the child's own). If an explicit tool name list is provided, only those tools from the parent's MCP sessions are forwarded.
- **`create_agent`**: The child has no published config. `tools: "all"` means the child inherits the parent's MCP session (same connected clients). An explicit list filters from the parent's tools.
- **`invoke_workflow`**: The published workflow's `mcpServers` are loaded from its `graph_data`. Same as `invoke_agent`.

In all cases, `injectSystemTools({ existingTools, isChildAgent: true })` adds system tools + the `finish` tool.

## Context Item Merging

For `invoke_agent`, context items from the dispatch params are concatenated with the published agent's own context items (agent's first, parent-provided after). For `create_agent`, only the dispatch-provided context items are used. This matches the execution API behavior.

## Depth Enforcement

The simulation handler enforces `maxNestingDepth` (default 10, configurable per agent). Before dispatching a child, the handler checks `composition.depth + 1 <= maxNestingDepth`. If exceeded, the dispatch tool returns an error string as its tool result instead of spawning the child. This matches the execution API's depth check.

## maxSteps Auto-Finish

The agent loop's existing `maxSteps` auto-finish behavior works in simulation without changes. When a child hits its step limit, the loop returns `finishResult` with `status: 'error'` and `output: 'Agent reached maximum step limit without completing the task.'` The simulation handler treats this identically to a normal `finishResult`.

## Error Handling

Child failures must not crash the SSE stream. The orchestrator wraps each child execution in try/catch:

1. **Child `executeAgentLoop` throws** (LLM API error, unexpected exception): Catch the error, emit `child_finished` with `status: 'error'` and `output: error.message`, inject error string as tool result into parent's messages, resume parent loop. The parent agent can then decide how to handle the failure.
2. **Child MCP session creation fails** (unreachable server, bad credentials): Same treatment as above. The child never starts; the error becomes the tool result.
3. **Client disconnects mid-stream** (user closes browser, navigates away): The handler listens for `req.on('close')` and propagates an abort signal via `AbortController`. The abort cascades to all active children — each depth level's `executeAgentLoop` receives the signal and stops. All MCP sessions (parent + all children) are closed in `finally` blocks regardless of which level threw.
4. **Partial completion** (child finishes but parent throws immediately after resume): The frontend has already received `child_finished`. The subsequent parent error is emitted as a normal `error` event. The frontend handles this gracefully — the composition stack shows the child completed but the parent failed.

## Security

1. **Org-scoped child resolution.** The child resolver always filters by `org_id` when fetching published agents/workflows: `WHERE org_id = $orgId AND slug = $slug AND version = $version`. A simulation user cannot invoke agents from other organizations.
2. **API key inheritance.** Children always use the parent's API key for LLM calls. If a child agent specifies a different model/provider in its config, the parent's key is still used. The child's `model` field may override the model name but not the key.
3. **`create_agent` sandboxing.** Dynamically created agents in simulation are sandboxed to the parent's API key, MCP sessions, and org context. They cannot access resources beyond what the parent can.

## Testing — TDD Contract-First

**Methodology: Tests are the source of truth.** Tests are written FIRST and encode the exact behavioral contract — state transitions, event sequences, message history preservation, and nesting semantics. Once tests are in place and verified to fail (red), implementation code is written to make them pass (green). If a test fails after implementation, the implementation is wrong, not the test. Tests are never modified to accommodate implementation quirks.

**What tests must verify (not just assert):** Tests must exercise actual behavior, not gimmicks. A test that mocks away the orchestrator and asserts a function was called is worthless. Tests must verify:
- The exact SSE event sequence emitted for a given scenario
- The exact shape of the composition stack after each state transition
- That message histories at each nesting level are preserved verbatim across requests
- That `currentNodeId` and `structuredOutputs` survive multi-turn child interactions for workflow parents
- That token totals accumulate correctly per-depth and in aggregate

### State preservation tests (the critical ones)

These verify the core invariant: message history IS the state, and it must survive perfectly across nesting levels and across HTTP request boundaries.

1. **Message history preservation across dispatch.** Parent has messages `[user, assistant, user, assistant(tool_call)]`. Parent dispatches child. Child finishes. Verify parent's messages after resume are `[user, assistant, user, assistant(tool_call), tool_result(child_output)]` — the original messages are untouched, child output is appended as tool result.

2. **Message history isolation between depths.** Parent has 4 messages. Child has 3 messages. Grandchild has 2 messages. Verify each depth's messages are independent — child never sees parent messages, grandchild never sees parent or child messages.

3. **Composition stack round-trip fidelity.** Construct a depth-2 composition stack with specific `parentMessages`, `parentCurrentNodeId`, `parentStructuredOutputs`. Serialize to JSON, deserialize, feed back to orchestrator. Verify the orchestrator produces identical behavior to a fresh execution.

4. **Workflow parent state preservation.** Workflow parent is at node "step-3" with `structuredOutputs: { "step-1": [...], "step-2": [...] }`. Parent dispatches child. Child finishes. Verify parent resumes at "step-3" with its `structuredOutputs` intact.

5. **Multi-turn child preserves parent state across requests.** Parent dispatches child. Child asks user a question (`child_waiting`). User responds (new HTTP request with composition stack). Child continues, asks another question. User responds again. Child finishes. Verify parent's messages from BEFORE the dispatch are exactly preserved through all these request boundaries.

### Event sequence tests

6. **Single-depth dispatch and finish.** Parent dispatches child via `invoke_agent`, child calls `finish`, parent continues. Verify exact SSE event order: parent events at `depth:0` → `child_dispatched` → child events at `depth:1` → `child_finished` → parent events at `depth:0` continue.

7. **Multi-turn child event sequence.** Parent dispatches child, child produces text (`child_waiting`). New request: child continues, calls `finish`. Verify: first request ends with `child_waiting`, second request starts with child events at `depth:1` then `child_finished` then parent events at `depth:0`.

8. **N-depth nesting (depth 3).** Parent → child → grandchild → finish → finish. Verify depth values on all events, correct unwinding order, token totals at each level.

9. **No `agent_response` for children.** Verify `agent_response` is only emitted at depth 0. Child completions emit `child_finished` only.

### Error and edge case tests

10. **Child failure.** Child's `executeAgentLoop` throws. Verify `child_finished(status:'error')` is emitted, error string injected as tool result, parent resumes normally.

11. **MaxNesting enforcement.** Dispatch at depth 10 (limit). Verify dispatch returns error tool result, no `child_dispatched` event emitted.

12. **MCP session cleanup on child failure.** Child creates MCP session, then throws. Verify session is closed. Verify parent's session is unaffected.

13. **Token aggregation.** Parent uses 100 input tokens. Child uses 200. Grandchild uses 50. Verify per-depth totals (0:100, 1:200, 2:50) and aggregate total (350).

### Test approach

The orchestrator is a pure function (config + callbacks → events). Tests mock `executeAgentLoop` to return controlled `AgentLoopResult` values (with specific `dispatchResult`, `finishResult`, tool calls, messages). Tests mock the child resolver to return predetermined configs. Tests collect emitted events and composition state, then assert against expected sequences and shapes. No Express mocks needed for orchestrator tests.

## Out of Scope

- Parallel child dispatch (multiple children at same depth). Current: first dispatch wins, rest error. Future enhancement.
- Child timeout in simulation. Simulation is interactive — user can cancel manually.
- Cost budget enforcement in simulation. Simulation is for testing, not billing.
- Workflow children with `user_reply` nodes. The execution API rejects these at dispatch time. The simulation resolver should perform the same validation.
