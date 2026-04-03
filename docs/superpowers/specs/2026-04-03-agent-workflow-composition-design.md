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
  appType: 'agent' | 'workflow';
}
```

### Message Routing

When a message arrives at `/api/agents/:slug/:version`:

1. Load session, check `agent_stack`
2. Stack empty → route to root agent
3. Stack non-empty → route to top entry's agent config
4. Execute against top agent's context (system prompt, tools, model, conversation history)

Each agent in the stack has its own conversation history in `agent_execution_messages`, keyed by `execution_id`. Children never see parent messages. Context items are the only cross-boundary data.

---

## Sub-project 1: Finish Tool + Completion Detection

### The `finish` Tool

Injected only into child agents (agents with a parent in the stack). NOT available to top-level agents.

**Parameters:**
- `output` (string, required) — the result to return to the parent
- `status` (`'success' | 'error'`, required) — completion status

### Agent Loop Behavior

Current behavior preserved: "no tool calls" = present message to user, wait for next input. This does NOT signal child completion.

When the agent loop detects `finish` in tool calls:
1. Stop the loop immediately (no further iterations)
2. Return a special result carrying the output and status

### System Prompt Injection

Appended to child agent system prompts:

```
When you have completed your task, you MUST call the `finish` tool with your final output. Do not simply respond with text — always use the `finish` tool to signal completion. If you encountered an error and cannot complete the task, call `finish` with status "error" and describe what went wrong in the output.
```

### What `finish` Triggers

1. Update the parent's tool output message in `agent_execution_messages` — replace the execution ID placeholder with the actual output
2. Pop the child from `agent_sessions.agent_stack`
3. Invoke a new serverless instance to resume the parent execution
4. Mark the child's execution as completed in `agent_executions`

### Workflows as Children

No `finish` tool needed. Reaching a terminal node triggers the same pop/resume/update flow. The terminal node's output (text or structured output) becomes the value that replaces the parent's tool output message.

---

## Sub-project 2: Invocation Mechanism + Scoped Resources

### Three Tools

**`create_agent`** — Dynamically define and dispatch an agent inline.

Parameters follow the unified `AgentConfig` interface (required: `systemPrompt`, `model`, `task`). Optional: `tools`, `contextItems`, `maxSteps`, and all other `AgentConfig` fields.

**`invoke_agent`** — Dispatch a predefined agent by slug.

Parameters:
- `agentSlug` (string, required)
- `task` (string, required) — initial instruction, inserted as first user message
- `contextItems` (array, optional) — concatenated with agent's own context items
- `model` (string, optional) — override the agent's configured model

**`invoke_workflow`** — Dispatch a predefined workflow by slug.

Parameters:
- `workflowSlug` (string, required)
- `user_said` (string, required) — initial input for workflow routing
- `contextItems` (array, optional)
- `model` (string, optional) — override

### Tool Availability

These three tools are system-level tools injected into every agent and workflow alongside MCP tools. They are always available.

### Unified `AgentConfig` Interface

A single TypeScript interface shared between:
- The UI agent editor (what gets saved to `agent_versions.graph_data`)
- The `create_agent` tool's input schema
- The execution layer's config resolution

When a new capability is added (VFS, memory, sandboxes), it's added to the interface once. Both UI-created agents and `create_agent` automatically require/support it. No field divergence possible.

### Tool Subsetting

The `tools` field accepts:
- `"all"` — child gets all of parent's tools
- An explicit array of tool names — must be a subset of parent's tools

Default when omitted: no tools (except system tools: `create_agent`, `invoke_agent`, `invoke_workflow`, and `finish` if it's a child agent).

### Context Items

**Predefined agents (`invoke_agent`):** Agent's own defined context items + parent-provided context items concatenated. Parent's items append to the end.

**Dynamic agents (`create_agent`):** Only what the parent provides.

**Workflows (`invoke_workflow`):** Parent-provided context items injected into the workflow's context data.

### Execution Flow on Dispatch

1. Tool returns immediately with `{ executionId: '<new-id>', status: 'dispatched' }` as the tool output message
2. Agent loop detects dispatch tool → stops → persists state
3. Parent's serverless instance terminates
4. New serverless instance starts the child execution

For `create_agent` / `invoke_agent`: The `task` parameter is inserted as the first user message in the child's execution. The child auto-executes its first turn immediately (no waiting for user input).

For `invoke_workflow`: The `user_said` parameter is the initial input. The workflow runs to completion (no multi-turn) — terminal node output triggers immediate parent resumption.

---

## Sub-project 3: Execution Model / Session Nesting

### Schema Changes

**`agent_sessions` — new column:**
- `agent_stack` JSONB DEFAULT '[]' — the stack of active child agents

**`agent_executions` — new column:**
- `parent_execution_id` uuid REFERENCES agent_executions(id) — null for top-level, set for children

### Dispatch Sequence (Agent Children)

1. Parent calls `invoke_agent({ agentSlug: 'recipe-bot', task: 'Generate a pasta recipe' })`
2. Tool handler:
   - Resolves agent config from slug
   - Creates new `agent_executions` record (status: 'running', parent_execution_id set)
   - Saves tool output message to parent's execution: `{ executionId: '<child-id>', status: 'dispatched' }`
   - Pushes stack entry onto `agent_sessions.agent_stack`
   - Signals agent loop to stop
3. Parent's execution stays status: 'running' (suspended, not completed)
4. Parent instance terminates
5. New instance starts → inserts `task` as user message → runs child's first turn
6. Child responds with text → instance terminates → client sees child's response
7. User sends next message → routed to child (stack top) → child continues
8. Child calls `finish(output, status)` → pop stack → update parent's tool output → resume parent on new instance

### Dispatch Sequence (Workflow Children)

1. Parent calls `invoke_workflow({ workflowSlug: 'order-flow', user_said: 'return item' })`
2. Same steps 2-4 as above
3. New instance starts → runs workflow with `user_said` → traverses graph to terminal node
4. Terminal node reached → output captured → pop stack → update parent's tool output → resume parent
5. Workflows complete in one server-side chain (no multi-turn)

### Cost Tracking

Each child execution tracks its own costs in `agent_executions`. Parent does NOT aggregate child costs into its own totals. The UI displays child cost on the dispatching node with a drill-down link.

### Session Locking

Existing `lock_session_for_update` unchanged. One message at a time — lock, check stack top, route, execute, unlock.

### Nesting Depth

Unlimited. Agent A → Agent B → Agent C → ... all works via the stack. No max depth enforced.

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

`agent_executions.parent_execution_id` enables traversing upward to build the breadcrumb chain.

### Execution List

Child executions appear in the execution list with a visual indicator (e.g., "sub-execution" badge or parent reference). Users can see all executions flat but understand the hierarchy.

---

## Sub-project 5: SSE Events + Event Persistence

### New Table: `agent_execution_events`

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
execution_id uuid NOT NULL REFERENCES agent_executions(id)
sequence integer NOT NULL
event_type text NOT NULL
payload jsonb NOT NULL
created_at timestamptz DEFAULT now()
UNIQUE(execution_id, sequence)
```

Every SSE event gets persisted before being sent to the client.

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
- `packages/api/src/tools/finishTool.ts` — The `finish` tool definition
- `packages/api/src/tools/dispatchTools.ts` — `create_agent`, `invoke_agent`, `invoke_workflow` tool definitions
- `packages/api/src/types/agentConfig.ts` — Unified `AgentConfig` interface
- `packages/api/src/core/agentStack.ts` — Stack push/pop/routing logic
- `packages/api/src/core/childDispatcher.ts` — Dispatch and resume orchestration
- `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx` — Breadcrumb navigation for nested executions

### Modified files
- `packages/api/src/agentLoop/agentLoop.ts` — Detect `finish` tool, detect dispatch tools, stop loop on either
- `packages/api/src/core/index.ts` — Workflow terminal node triggers child completion flow
- `packages/backend/src/routes/execute/executeHandler.ts` — Stack-based message routing
- `packages/backend/src/routes/execute/executePersistence.ts` — Persist events, handle stack updates
- `packages/backend/src/routes/simulateHandler.ts` — Same dispatch/resume flow for simulate path
- `packages/backend/src/routes/simulateAgentHandler.ts` — Same for agent simulate
- `packages/web/app/hooks/useSimulation.ts` — SSE connection stack management
- `packages/web/app/lib/api.ts` — Replay support (`?after=`), new event types
- `packages/web/app/components/dashboard/node-inspector/` — Child execution display + drill-down link

### Schema changes
- `agent_sessions` — add `agent_stack` JSONB column
- `agent_executions` — add `parent_execution_id` column
- New table: `agent_execution_events`
