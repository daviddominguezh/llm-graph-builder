# Agent/Workflow Composition — Design Spec

## Overview

Enable agents and workflows to invoke each other via tool calls. A workflow can call an agent or another workflow. An agent can call another agent (predefined or dynamically defined) or a workflow. The invocation mechanism is event-driven and non-blocking — parent serverless instances terminate after dispatch, and child completion triggers parent resumption on a new instance.

## Core Abstraction: The Agent Stack

Every session has an `agent_stack` — a JSONB array on `agent_sessions`. Messages always route to the stack top. The external client never changes endpoint or session ID.

```
Initial:              stack = [ParentAgent]
Parent dispatches B:  stack = [ParentAgent, AgentB]
B dispatches C:       stack = [ParentAgent, AgentB, AgentC]
C calls finish:       stack = [ParentAgent, AgentB]  ← B resumes
B calls finish:       stack = [ParentAgent]           ← Parent resumes
```

### Stack Entry Schema

```typescript
interface AgentStackEntry {
  executionId: string;
  agentConfig: ResolvedAgentConfig;
  parentExecutionId: string;
  parentToolOutputMessageId: string;
  parentSessionState: {
    currentNodeId: string;
    structuredOutputs: Record<string, unknown[]>;
  };
  appType: 'agent' | 'workflow';
  dispatchedAt: string; // ISO timestamp for timeout detection
}
```

The `parentSessionState` snapshot preserves the parent's `currentNodeId` and `structuredOutputs` at the moment of dispatch. When the child completes and the parent resumes, these values are restored to `agent_sessions` before the parent's agent loop continues. This prevents the child's execution from overwriting the parent's workflow position.

### Message Routing

When a message arrives at `/api/agents/:slug/:version`:

1. Load session, check `agent_stack`
2. Stack empty → route to root agent
3. Stack non-empty → route to top entry's agent config
4. Execute against top agent's context (system prompt, tools, model, conversation history)

Each agent in the stack has its own conversation history in `agent_execution_messages`, keyed by `execution_id`. Children never see parent messages. Context items are the only cross-boundary data.

### Nesting Depth

Default maximum: 10 levels. Configurable per agent in the UI. Enforced at dispatch time — if pushing onto the stack would exceed the limit, the dispatch tool returns an error instead of dispatching. This prevents runaway recursive agents.

**Future consideration:** The stack model is currently single-child (one active child at a time). A future version will support parallel children by replacing the stack with a tree structure. For now, if the LLM calls multiple dispatch tools in a single step, only the first is executed; the others return an error: `"Only one child dispatch per step is supported."` The architecture should avoid assumptions that make parallel dispatch harder later (e.g., don't hardcode "stack top" checks — use an `activeChildExecutionId` accessor that can evolve).

---

## Tool Interception Mechanism

Dispatch tools (`create_agent`, `invoke_agent`, `invoke_workflow`) and the `finish` tool cannot be executed by the AI SDK's `generateText` like regular tools. They need special handling because they control the agent loop lifecycle.

**Approach: Sentinel-based interception.**

1. Dispatch and finish tools are registered with the AI SDK as regular tools, but their `execute` functions return **sentinel values** — special objects that the loop recognizes.

```typescript
// Sentinel types
interface DispatchSentinel {
  __sentinel: 'dispatch';
  type: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
}

interface FinishSentinel {
  __sentinel: 'finish';
  output: string;
  status: 'success' | 'error';
}
```

2. After each `generateText` step, the agent loop inspects tool results for sentinels. If found:
   - **`finish` sentinel:** Stop the loop, return a `FinishResult` with output and status.
   - **Dispatch sentinel:** Stop the loop, return a `DispatchResult` with the child config.
   - **Multiple dispatch sentinels in one step:** Execute the first, return errors for the rest.

3. The sentinel values are stored as the tool output message in `agent_execution_messages`. On child completion, the sentinel placeholder is replaced with the actual output.

**For workflows:** The three dispatch tools are injected into every workflow node's tool set via `toolsByEdge` augmentation. The workflow's `processToolNode` / `executeAgent` path checks for sentinels in the same way.

---

## Authentication & Resource Inheritance

Children inherit the parent's security context. No re-authentication needed.

**Inherited from parent:**
- `orgId` — the organization scope
- LLM API key — from `org_api_keys` (the production key)
- Execution key reference — `executionKeyId` for audit trail
- MCP server configs — when `tools: "all"` is specified, the child gets the parent's MCP server configurations and creates its own MCP session from them

**NOT inherited:**
- Conversation history (child starts fresh)
- Session ID (child shares the parent's session via the stack, but has its own execution)

**For `invoke_agent` / `invoke_workflow`:** The referenced agent/workflow must belong to the same `orgId`. Cross-org invocation is not permitted.

**For `create_agent`:** No slug or `agent_id` exists. The child execution uses the parent's `agent_id` with a special flag (`is_dynamic_child: true`) so it can be distinguished in analytics. Cost tracking uses the parent's `agent_id` but the execution is marked as a dynamic child in `agent_executions`.

---

## Tool Name Conflicts

System tools (`finish`, `create_agent`, `invoke_agent`, `invoke_workflow`) use a `__system_` prefix internally to avoid collisions with MCP tools. The LLM sees them as `__system_finish`, `__system_create_agent`, etc. The system prompt references these prefixed names.

If an MCP server exposes a tool with a `__system_` prefix, it is rejected at MCP session creation time with a warning logged.

---

## Sub-project 1: Finish Tool + Completion Detection

### The `finish` Tool

Injected only into child agents (agents with a parent in the stack). NOT available to top-level agents. Registered as `__system_finish` to avoid name collisions.

**Parameters:**
- `output` (string, required) — the result to return to the parent
- `status` (`'success' | 'error'`, required) — completion status

### Agent Loop Behavior

Current behavior preserved: "no tool calls" = present message to user, wait for next input. This does NOT signal child completion.

When the agent loop detects a `FinishSentinel` in tool results after a step:
1. Stop the loop immediately (no further iterations)
2. Return a `FinishResult` carrying the output and status

### System Prompt Injection

Appended to child agent system prompts:

```
When you have completed your task, you MUST call the `__system_finish` tool with your final output. Do not simply respond with text — always use the `__system_finish` tool to signal completion. If you encountered an error and cannot complete the task, call `__system_finish` with status "error" and describe what went wrong in the output.
```

### What `finish` Triggers

1. Update the parent's tool output message in `agent_execution_messages` — replace the sentinel placeholder with the actual output
2. Pop the child from `agent_sessions.agent_stack`
3. Restore parent's session state (`currentNodeId`, `structuredOutputs`) from the stack entry's `parentSessionState`
4. Trigger parent resumption (see Resume Mechanism below)
5. Mark the child's execution as completed in `agent_executions`

### Workflows as Children

No `finish` tool needed. Reaching a terminal node triggers the same pop/resume/update flow. The terminal node's output (text or structured output) becomes the value that replaces the parent's tool output message.

**Constraint:** Child workflows must not contain `user_reply` nodes (nodes with `nextNodeIsUser: true`). This is validated at dispatch time — if the referenced workflow has `user_reply` nodes, the dispatch tool returns an error. Workflows as children must be fully deterministic and complete in one pass.

---

## Sub-project 2: Invocation Mechanism + Scoped Resources

### Three Tools

All registered with `__system_` prefix to avoid MCP tool name collisions.

**`__system_create_agent`** — Dynamically define and dispatch an agent inline.

Parameters follow the unified `AgentConfig` interface (required: `systemPrompt`, `model`, `task`). Optional: `tools`, `contextItems`, `maxSteps`, and all other `AgentConfig` fields.

**`__system_invoke_agent`** — Dispatch a predefined agent by slug.

Parameters:
- `agentSlug` (string, required)
- `task` (string, required) — initial instruction, inserted as first user message
- `contextItems` (array, optional) — concatenated with agent's own context items
- `model` (string, optional) — override the agent's configured model

**`__system_invoke_workflow`** — Dispatch a predefined workflow by slug.

Parameters:
- `workflowSlug` (string, required)
- `user_said` (string, required) — initial input for workflow routing (matched against edge preconditions from `INITIAL_STEP`)
- `contextItems` (array, optional)
- `model` (string, optional) — override

### Tool Availability

These three tools are system-level tools injected into every agent and workflow alongside MCP tools. They are always available.

### Unified `AgentConfig` Interface

A single TypeScript interface shared between:
- The UI agent editor (what gets saved to `agent_versions.graph_data`)
- The `__system_create_agent` tool's input schema
- The execution layer's config resolution

```typescript
interface AgentConfig {
  systemPrompt: string;
  model?: string;           // Required for create_agent, optional for invoke (uses agent's default)
  maxSteps?: number | null;
  contextItems?: ContextItem[];
  mcpServers?: McpServerConfig[];
  skills?: SkillDefinition[];
  // Future: vfs, memory, sandboxes, etc.
}
```

This is the **stored config** shape — what gets persisted. The **runtime config** (`AgentLoopConfig`) extends this with runtime-only fields (`apiKey`, `messages`, `tools` as resolved Tool objects). The stored config is a strict subset.

When a new capability is added (VFS, memory, sandboxes), it's added to `AgentConfig` once. Both UI-created agents and `__system_create_agent` automatically require/support it. No field divergence possible.

### Tool Subsetting

The `tools` field accepts:
- `"all"` — child gets all of parent's tools (parent's MCP server configs are passed to the child so it can create its own MCP session)
- An explicit array of tool names — must be a subset of parent's tools

Default when omitted: no MCP tools. System tools (`__system_create_agent`, `__system_invoke_agent`, `__system_invoke_workflow`, and `__system_finish` for children) are always included.

When `tools: "all"` is specified, the parent's MCP server configs are stored in the stack entry so the child's serverless instance can recreate the MCP sessions.

### Context Items

**Predefined agents (`invoke_agent`):** Agent's own defined context items + parent-provided context items concatenated. Parent's items append to the end.

**Dynamic agents (`create_agent`):** Only what the parent provides.

**Workflows (`invoke_workflow`):** Parent-provided context items injected into the workflow's context data.

### Execution Flow on Dispatch

1. Dispatch tool `execute` function returns a `DispatchSentinel` immediately
2. Agent loop detects the sentinel after the step, stops the loop
3. The dispatch handler:
   - Validates nesting depth (rejects if at max)
   - Validates the referenced agent/workflow belongs to the same org
   - For `invoke_workflow`: validates the workflow has no `user_reply` nodes
   - Creates new `agent_executions` record (status: 'running', `parent_execution_id` set)
   - Saves sentinel as tool output message to parent's execution
   - Snapshots parent's session state (`currentNodeId`, `structuredOutputs`)
   - Pushes stack entry onto `agent_sessions.agent_stack`
   - Parent's serverless instance terminates
4. Resume mechanism triggers the child execution (see below)

For `create_agent` / `invoke_agent`: The `task` parameter is inserted as the first user message in the child's execution. The child auto-executes its first turn immediately (no waiting for user input).

For `invoke_workflow`: The `user_said` parameter is the initial input. The workflow runs to completion (no multi-turn) — terminal node output triggers immediate parent resumption.

---

## Resume Mechanism

When a child completes (via `finish` tool or workflow terminal node) or when a child is dispatched, a new serverless instance must be started. This is done via an **authenticated HTTP POST to the backend**.

### Child Start (after parent dispatches)

The parent's dispatch handler makes an HTTP POST to an internal endpoint:

```
POST /internal/execute-child
Authorization: Bearer <service-key>
Body: {
  sessionId,
  executionId: <child-execution-id>,
  initialMessage: <task or user_said>,
  agentConfig: <resolved config>,
  orgId,
  apiKeyId,
  mcpServerConfigs: [...],  // if tools: "all"
}
```

This is an internal-only endpoint (not exposed publicly). It starts the child execution on a new serverless instance.

### Parent Resume (after child completes)

The child's completion handler makes an HTTP POST:

```
POST /internal/resume-parent
Authorization: Bearer <service-key>
Body: {
  sessionId,
  parentExecutionId,
  parentToolOutputMessageId,
  childOutput: <finish output or terminal node output>,
  childStatus: <success or error>,
  parentSessionState: { currentNodeId, structuredOutputs },
}
```

This endpoint:
1. Updates the parent's tool output message with `childOutput`
2. Restores the parent's session state
3. Pops the stack entry
4. Resumes the parent's agent loop (loads messages, continues from where it left off)

Both internal endpoints use a service-level bearer token (not user-facing execution keys) for authentication.

---

## Child Failure Detection

Children can fail in multiple ways. The system uses a layered detection approach, with timeout as the last resort.

### Layer 1: Catch crashes in the child's serverless instance

The child execution handler wraps all work in a try/catch. On any uncaught exception:
1. Mark child's `agent_executions.status = 'failed'` with error message
2. Update parent's tool output message with error: `{ status: 'error', output: 'Child execution failed: <error>' }`
3. Pop the stack entry, restore parent session state
4. Trigger parent resumption via `POST /internal/resume-parent`

This handles: runtime exceptions, model API failures, MCP tool failures, out-of-memory, etc.

### Layer 2: Detect edge function / serverless platform errors

If the serverless platform itself fails (e.g., cold start timeout, infrastructure error), the HTTP POST to `/internal/execute-child` returns a non-2xx status. The parent's dispatch handler:
1. Detects the failure
2. Rolls back: removes stack entry, marks child execution as failed
3. Returns an error to the parent's agent loop (the dispatch tool "failed"), allowing the parent to continue or surface the error

### Layer 3: Timeout (last resort)

A configurable timeout per agent, with a default of **10 minutes**. Stored in `AgentConfig` as `childTimeout` (in seconds). Displayed and editable in the agent editor UI.

**Implementation:** A scheduled job (cron or Supabase pg_cron) runs every minute:

```sql
-- Find orphaned parent executions
SELECT ae.id, ae.session_id, ase.agent_stack
FROM agent_executions ae
JOIN agent_sessions ase ON ase.id = ae.session_id
WHERE ae.status = 'running'
  AND jsonb_array_length(ase.agent_stack) > 0
  AND (ase.agent_stack->-1->>'dispatchedAt')::timestamptz
      + interval '1 second' * <childTimeout>
      < now()
```

For each orphaned execution:
1. Mark child as failed: `agent_executions.status = 'failed'`, error: `'Child execution timed out'`
2. Update parent's tool output with error
3. Pop stack, restore parent session state
4. Trigger parent resumption

The timeout is the **last resort** — Layers 1 and 2 should catch the vast majority of failures immediately.

---

## Sub-project 3: Execution Model / Session Nesting

### Schema Changes

**`agent_sessions` — new column:**
- `agent_stack` JSONB DEFAULT '[]' — the stack of active child agents

**`agent_executions` — new columns:**
- `parent_execution_id` uuid REFERENCES agent_executions(id) — null for top-level, set for children
- `is_dynamic_child` boolean DEFAULT false — true for `create_agent` children (no slug)

**Index:**
- `CREATE INDEX idx_agent_executions_parent ON agent_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL`

### Dispatch Sequence (Agent Children)

1. Parent calls `__system_invoke_agent({ agentSlug: 'recipe-bot', task: 'Generate a pasta recipe' })`
2. `execute` function returns `DispatchSentinel`
3. Agent loop detects sentinel, stops loop
4. Dispatch handler:
   - Resolves agent config from slug (must be same org)
   - Creates new `agent_executions` record (status: 'running', `parent_execution_id` set)
   - Saves sentinel as tool output message to parent's execution
   - Snapshots parent session state, pushes stack entry
   - Posts to `/internal/execute-child`
5. Parent's execution stays status: 'running' (suspended)
6. Parent instance terminates
7. Child instance starts → inserts `task` as user message → runs child's first turn
8. Child responds with text → instance terminates → client sees child's response
9. User sends next message → routed to child (stack top) → child continues
10. Child calls `__system_finish(output, status)` → Layers 1-3 completion flow → resume parent

### Dispatch Sequence (Workflow Children)

1. Parent calls `__system_invoke_workflow({ workflowSlug: 'order-flow', user_said: 'return item' })`
2. Same steps 2-6 as above
3. Child instance starts → runs workflow with `user_said` → traverses graph to terminal node
4. Terminal node reached → output captured → completion flow → resume parent
5. Workflows complete in one server-side chain (no multi-turn)

### Cost Tracking

Each child execution tracks its own costs in `agent_executions`. Parent does NOT aggregate child costs into its own totals. The UI displays child cost on the dispatching node with a drill-down link.

**Dynamic children (`create_agent`):** Use the parent's `agent_id` with `is_dynamic_child = true`. This keeps cost attribution under the parent agent but allows filtering in analytics.

**`agent_execution_summary` materialized view:** Add a `WHERE parent_execution_id IS NULL` filter to exclude child executions from top-level counts. Child costs are accessible via the parent's drill-down view.

### Conversation History Isolation

Messages are loaded by `execution_id`, not `session_id`, when a child is active. The current `getSessionMessages` function is modified to accept an optional `executionId` parameter. When provided, it filters by `execution_id` instead of loading all session messages.

### Session Locking

Existing `lock_session_for_update` unchanged. One message at a time — lock, check stack top, route, execute, unlock. The lock is acquired before stack inspection and held through the entire execution, ensuring atomicity during the dispatch-to-child-start transition.

---

## Sub-project 4: Dashboard / Debug View

### Parent Execution View

Nodes that dispatched a child show:
- Visited state like any other node
- Child's aggregated cost (total tokens, cost USD, duration)
- Child's status (completed / running / failed)
- Child's output (the `finish` output or workflow terminal output)
- A link to open the child's execution in the debug view

### Child Execution View

Same debug/inspector UI, loaded with child's `executionId`. Shows all child turns, tool calls, node visits, token usage. No new UI components.

### Navigation

- Parent view → click child node → navigates to child execution (new page, child execution ID in URL)
- Child view → breadcrumb → return to parent
- Deep nesting: breadcrumb shows full chain: `Parent Execution > Agent B > Agent C`

### Breadcrumb Data

`agent_executions.parent_execution_id` enables traversing upward to build the breadcrumb chain. The index on `parent_execution_id` ensures fast lookups.

### Execution List

Child executions appear in the execution list with a visual indicator (e.g., "sub-execution" badge or parent reference). The summary view excludes child executions from top-level metrics (filtered by `parent_execution_id IS NULL`).

### Child Timeout Configuration

The agent editor UI displays a "Child execution timeout" field (in the advanced/settings section) with a default value of 10 minutes. This maps to `AgentConfig.childTimeout`.

---

## Sub-project 5: SSE Events + Event Persistence

### New Table: `agent_execution_events`

```sql
CREATE TABLE agent_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  sequence integer NOT NULL GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(execution_id, sequence)
);

ALTER TABLE agent_execution_events ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can read events for their org's executions
CREATE POLICY "org_members_select_events" ON agent_execution_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_executions ae
      WHERE ae.id = agent_execution_events.execution_id
        AND is_org_member(ae.org_id)
    )
  );

-- INSERT: service role only (backend inserts events)
-- No explicit INSERT policy needed — backend uses service role key which bypasses RLS
```

**Sequence generation:** Uses `GENERATED ALWAYS AS IDENTITY` — a global auto-increment. This is monotonically increasing within each execution (since events are inserted sequentially per execution) and works correctly with the `?after=<sequence>` replay mechanism. No application-level counter needed.

Every SSE event gets persisted to this table before being sent to the client.

### New Event Types

- `child_dispatched` — emitted by parent before terminating: `{ childExecutionId, childAgentSlug?, childAppType, task }`
- `child_completed` — emitted by child on completion: `{ parentExecutionId, output, status }`

All existing event types remain unchanged and also get persisted.

### Replay Support

SSE endpoint accepts `?after=<sequence>`. On connect:

1. Query `agent_execution_events WHERE execution_id = X AND sequence > after ORDER BY sequence`
2. Send all missed events
3. Switch to live streaming

If `after` omitted, start from beginning or live-only if execution hasn't started.

### Client-Side Handoff (Simulate Path)

1. Client opens SSE to parent execution
2. Receives events normally
3. Receives `child_dispatched` → pushes connection onto local stack
4. Opens new SSE to child execution (same `/api/simulate` endpoint, child's params)
5. Receives child events
6. Receives `child_completed` → pops stack
7. Opens new SSE to parent with `?after=<last_parent_sequence>`
8. Replays any missed parent events, continues live

### Client-Side Handoff (API Path)

**`stream=true`:** Same mechanism as simulate path. Client manages connection stack.

**`stream=false`:** No SSE. Each API call is one turn, routed to stack top, response returned synchronously. No connection management needed.

- When a child agent is multi-turn: the API call returns the child's response (e.g., a question to the user). Subsequent API calls route to the child. When the child calls `finish`, the parent resumes and the parent's response is returned in that same API call.
- For workflows-as-children: the entire child→parent chain completes in one API call.

---

## File Changes Summary

### New files
- `packages/api/src/tools/finishTool.ts` — The `__system_finish` tool definition with `FinishSentinel`
- `packages/api/src/tools/dispatchTools.ts` — `__system_create_agent`, `__system_invoke_agent`, `__system_invoke_workflow` with `DispatchSentinel`
- `packages/api/src/types/agentConfig.ts` — Unified `AgentConfig` interface (stored config shape)
- `packages/api/src/core/agentStack.ts` — Stack push/pop/routing logic, parent state snapshot/restore
- `packages/api/src/core/childDispatcher.ts` — Dispatch orchestration, child start, parent resume
- `packages/api/src/core/sentinelDetector.ts` — Post-step sentinel detection in tool results
- `packages/backend/src/routes/internal/executeChildHandler.ts` — `/internal/execute-child` endpoint
- `packages/backend/src/routes/internal/resumeParentHandler.ts` — `/internal/resume-parent` endpoint
- `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx` — Breadcrumb navigation for nested executions
- `supabase/migrations/YYYYMMDD_agent_composition.sql` — Schema changes (agent_stack, parent_execution_id, agent_execution_events)

### Modified files
- `packages/api/src/agentLoop/agentLoop.ts` — Post-step sentinel detection, new exit conditions for finish/dispatch
- `packages/api/src/agentLoop/agentLoopTypes.ts` — `AgentLoopResult` extended with `dispatchResult?` and `finishResult?` fields
- `packages/api/src/core/index.ts` — Workflow terminal node triggers child completion flow when session has parent
- `packages/api/src/core/toolCallExecutor.ts` — Inject system tools alongside MCP tools
- `packages/api/src/stateMachine/index.ts` — Inject dispatch tools into workflow node tool sets via `toolsByEdge` augmentation
- `packages/backend/src/routes/execute/executeHandler.ts` — Stack-based message routing, dispatch/resume orchestration
- `packages/backend/src/routes/execute/executePersistence.ts` — Persist events to `agent_execution_events`, handle stack updates
- `packages/backend/src/routes/execute/executeFetcher.ts` — Load `agent_stack` from session, execution-scoped message retrieval
- `packages/backend/src/routes/execute/executeAgentPath.ts` — Dispatch detection, MCP config inheritance
- `packages/backend/src/db/queries/executionQueries.ts` — `parent_execution_id` in `createExecution`, `agent_stack` updates, execution-scoped `getSessionMessages`
- `packages/backend/src/routes/simulateHandler.ts` — Same dispatch/resume flow for simulate path
- `packages/backend/src/routes/simulateAgentHandler.ts` — Same for agent simulate
- `packages/backend/src/routes/simulate.ts` — Event persistence for simulate SSE events
- `packages/backend/src/routes/simulateAgentSse.ts` — Event persistence for agent simulate SSE events
- `packages/backend/src/server.ts` — Register `/internal/execute-child` and `/internal/resume-parent` routes
- `packages/web/app/hooks/useSimulation.ts` — SSE connection stack management
- `packages/web/app/lib/api.ts` — Replay support (`?after=`), new event types, connection stack state machine
- `packages/web/app/components/dashboard/node-inspector/` — Child execution display + drill-down link
- `packages/web/app/components/agent-editor/` — Child timeout configuration field

### Schema changes
- `agent_sessions` — add `agent_stack JSONB DEFAULT '[]'` column
- `agent_executions` — add `parent_execution_id uuid REFERENCES agent_executions(id)`, add `is_dynamic_child boolean DEFAULT false`
- `agent_executions` — add index `idx_agent_executions_parent` on `parent_execution_id`
- `agent_execution_summary` — add `WHERE parent_execution_id IS NULL` filter
- New table: `agent_execution_events` with RLS policies
- `agent_execution_messages` — add UPDATE policy for service role (to replace sentinel with child output)
