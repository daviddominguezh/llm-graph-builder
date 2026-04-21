# Agent/Workflow Composition — Design Spec

## Overview

Enable agents and workflows to invoke each other via tool calls. A workflow can call an agent or another workflow. An agent can call another agent (predefined or dynamically defined) or a workflow. The invocation mechanism is event-driven and non-blocking — parent serverless instances terminate after dispatch, and child completion triggers parent resumption on a new instance.

## Core Abstraction: The Agent Stack

Every session has an agent stack — stored as individual rows in `agent_stack_entries` table (not JSONB on `agent_sessions`). Messages always route to the topmost entry. The external client never changes endpoint or session ID.

```
Initial:              stack = [ParentAgent]
Parent dispatches B:  stack = [ParentAgent, AgentB]
B dispatches C:       stack = [ParentAgent, AgentB, AgentC]
C calls finish:       stack = [ParentAgent, AgentB]  ← B resumes
B calls finish:       stack = [ParentAgent]           ← Parent resumes
```

### Stack Storage: `agent_stack_entries` Table

```sql
CREATE TABLE agent_stack_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  depth integer NOT NULL,  -- 0 = root, 1 = first child, etc.
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_execution_id uuid REFERENCES agent_executions(id),
  parent_tool_output_message_id uuid,
  parent_session_state jsonb,  -- { currentNodeId, structuredOutputs }
  agent_config jsonb NOT NULL, -- ResolvedAgentConfig
  app_type text NOT NULL CHECK (app_type IN ('agent', 'workflow')),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, depth)
);

CREATE INDEX idx_stack_entries_session ON agent_stack_entries(session_id);
CREATE INDEX idx_stack_entries_execution ON agent_stack_entries(execution_id);
```

**Push = INSERT** a new row with `depth = current_max + 1`. **Pop = DELETE** the row with the highest depth. **Get top = SELECT** with `ORDER BY depth DESC LIMIT 1`. No JSONB rewrites on hot session rows. Each operation is a single-row insert or delete.

### Stack Entry Fields

- `execution_id` — the child's execution
- `parent_execution_id` — the parent's execution (null for root)
- `parent_tool_output_message_id` — which message to update on completion
- `parent_session_state` — snapshot of parent's `currentNodeId` and `structuredOutputs` at dispatch time, restored on resume
- `agent_config` — the resolved config for this stack level
- `app_type` — `'agent'` or `'workflow'`
- `dispatched_at` — ISO timestamp for timeout detection

### Message Routing

When a message arrives at `/api/agents/:slug/:version`:

1. Load session, query `agent_stack_entries` for this session (top entry)
2. No entries → route to root agent
3. Entry exists → route to top entry's agent config
4. Execute against top agent's context (system prompt, tools, model, conversation history)

Each agent in the stack has its own conversation history in `agent_execution_messages`, keyed by `execution_id`. Children never see parent messages. Context items are the only cross-boundary data.

### Nesting Depth

Default maximum: 10 levels. Configurable per agent in the UI via `AgentConfig.maxNestingDepth`. Enforced at dispatch time — if pushing onto the stack would exceed the limit, the dispatch tool returns an error instead of dispatching. This prevents runaway recursive agents.

**Future consideration:** The stack model is currently single-child (one active child at a time). A future version will support parallel children by allowing multiple entries at the same depth (tree structure). For now, if the LLM calls multiple dispatch tools in a single step, only the first is executed; the others return an error: `"Only one child dispatch per step is supported."` The architecture should avoid assumptions that make parallel dispatch harder later (e.g., use an `activeChildExecutionId` accessor that can evolve into `activeChildExecutionIds`).

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

**Internal endpoints** (`/internal/execute-child`, `/internal/resume-parent`) use a service-level bearer token. The parent passes its `orgId`, `apiKeyId`, and `executionKeyId` in the request body so the child inherits the full auth context without re-resolving.

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

**Optional output schema validation:** The parent can specify an `outputSchema` (JSON Schema) on the dispatch tool. When provided, the `finish` tool validates the `output` string against the schema before accepting. If validation fails, the tool returns an error to the agent with a message explaining what's wrong, and the agent loop continues (giving the agent a chance to fix its output and call `finish` again). This ensures the parent receives output in the expected format.

### Agent Loop Behavior

Current behavior preserved: "no tool calls" = present message to user, wait for next input. This does NOT signal child completion.

When the agent loop detects a `FinishSentinel` in tool results after a step:
1. Stop the loop immediately (no further iterations)
2. Return a `FinishResult` carrying the output and status

**maxSteps exhaustion in child agents:** When a child agent hits its `maxSteps` limit, the loop auto-finishes with `status: 'error'` and `output: 'Agent reached maximum step limit without completing the task.'` instead of silently returning an empty string. This triggers the normal child completion flow (update parent tool output, pop stack, resume parent) with an error status. The parent sees a clear error and can decide to retry or handle it.

### System Prompt Injection

Child agent system prompts receive completion instructions in a structured XML-tagged section, placed at **both the start and end** of the system prompt for maximum model attention:

```xml
<system-instructions>
You are a sub-agent dispatched to complete a specific task. When you have fully completed your task, you MUST call the `__system_finish` tool with your final output. Do not simply respond with text — always use `__system_finish` to signal completion.

If you encountered an error and cannot complete the task, call `__system_finish` with status "error" and describe what went wrong in the output.

IMPORTANT: Only call `__system_finish` when you are truly done. If you need more information from the user, respond with a text message instead — the user will reply, and you can continue working.
</system-instructions>
```

### Structured Error Responses

When a child fails (whether via `finish(status: 'error')`, maxSteps exhaustion, or crash), the parent's tool output message is replaced with a structured error object, not a plain string:

```typescript
interface ChildErrorOutput {
  status: 'error';
  error: string;            // human-readable error description
  errorCode: 'finish_error' | 'max_steps' | 'crash' | 'timeout';
  stepsCompleted: number;   // how far the child got
  lastToolCall?: string;    // last tool the child called (if any)
  partialOutput?: string;   // last text the child produced (if any)
}
```

This gives the parent enough information to make intelligent recovery decisions (retry, try a different agent, surface error to user, etc.).

For success, the output is the raw string (or schema-validated output) from the `finish` call.

### What `finish` Triggers

1. Update the parent's tool output message in `agent_execution_messages` — replace the sentinel placeholder with the actual output (or structured error)
2. Delete the child's `agent_stack_entries` row (pop)
3. Restore parent's session state (`currentNodeId`, `structuredOutputs`) from the stack entry's `parent_session_state`
4. Write a resume intent to `pending_resumes` table (see Resume Mechanism)
5. Attempt direct resume via `POST /internal/resume-parent`
6. Mark the child's execution as completed in `agent_executions`

### Workflows as Children

No `finish` tool needed. Reaching a terminal node triggers the same pop/resume/update flow. The terminal node's output (text or structured output) becomes the value that replaces the parent's tool output message.

**Constraint:** Child workflows must not contain `user_reply` nodes (nodes with `nextNodeIsUser: true`). This is validated at dispatch time — if the referenced workflow has `user_reply` nodes, the dispatch tool returns an error. Workflows as children must be fully deterministic and complete in one pass.

**In-process optimization:** Since workflow children always complete in one pass (no multi-turn), they execute **in-process within the parent's serverless instance**. No HTTP dispatch, no new instance, no terminate-and-resume. The parent calls the workflow execution function directly, gets the result, and continues. This eliminates 2 unnecessary serverless instance starts per workflow child invocation.

---

## Sub-project 2: Invocation Mechanism + Scoped Resources

### Three Tools

All registered with `__system_` prefix to avoid MCP tool name collisions.

**`__system_create_agent`** — Dynamically define and dispatch an agent inline.

Parameters follow the unified `AgentConfig` interface (required: `systemPrompt`, `task`; `model` defaults to parent's). Optional: `tools`, `contextItems`, `maxSteps`, `fewShotExamples`, `outputSchema`, and all other `AgentConfig` fields.

**`__system_invoke_agent`** — Dispatch a predefined agent by slug.

Parameters:
- `agentSlug` (string, required)
- `version` (number | `'latest'`, required) — which published version to execute
- `task` (string, required) — initial instruction, inserted as first user message
- `contextItems` (array, optional) — concatenated with agent's own context items
- `model` (string, optional) — override the agent's configured model
- `outputSchema` (JSON Schema, optional) — validate the child's `finish` output against this schema

**`__system_invoke_workflow`** — Dispatch a predefined workflow by slug.

Parameters:
- `workflowSlug` (string, required)
- `version` (number | `'latest'`, required) — which published version to execute
- `user_said` (string, required) — initial input for workflow routing (matched against edge preconditions from `INITIAL_STEP`)
- `contextItems` (array, optional)
- `model` (string, optional) — override

### Dynamic Agent Lifecycle (`create_agent`)

Dynamic agents created via `__system_create_agent` are ephemeral:

- **No UI visibility:** No `agents` or `agent_versions` row is created. The agent does not appear in the app list.
- **Multi-turn persistence:** The dynamic agent's state lives in `agent_execution_messages` (keyed by `execution_id`) and `agent_stack_entries`. This is sufficient for multi-turn conversations — when the user sends a new message, the stack top points to the dynamic agent's config, and its messages are loaded by execution ID.
- **Cleanup on completion:** When the dynamic agent calls `finish`, the stack entry is deleted. The `agent_executions` and `agent_execution_messages` records remain for debugging and cost tracking (marked with `is_dynamic_child = true`).
- **Cleanup on crash:** Same — the stack entry is deleted during crash recovery (Layer 1 or Layer 3). Execution records are kept with `status = 'failed'`.

### Tool Availability

These three tools are system-level tools injected into every agent and workflow alongside MCP tools. They are always available.

### Unified `AgentConfig` Interface

A single TypeScript interface shared between:
- The UI agent editor (what gets saved to `agent_versions.graph_data`)
- The `__system_create_agent` tool's input schema
- The execution layer's config resolution

```typescript
// Context items are strings — same type used in the agent editor UI.
// Each string is a piece of context injected into the agent's system prompt.
// Defined in agentConfig.schema.ts as z.array(z.string()).
type ContextItem = string;

interface FewShotExample {
  input: string;   // example user message or task
  output: string;  // expected agent response
}

interface AgentConfig {
  systemPrompt: string;
  model?: string;           // For create_agent: defaults to parent's model if omitted.
                            // For invoke_agent: defaults to the agent's own configured model.
  maxSteps?: number | null;
  contextItems?: ContextItem[];
  mcpServers?: McpServerConfig[];
  skills?: SkillDefinition[];
  fewShotExamples?: FewShotExample[];  // injected as conversation history before the task
  childTimeout?: number;    // seconds, default 600 (10 minutes)
  maxNestingDepth?: number; // default 10
  // Future: vfs, memory, sandboxes, etc.
}
```

**`model` defaults for `create_agent`:** When `model` is omitted in a `__system_create_agent` call, the child inherits the parent's model. This prevents LLMs from hallucinating model names. The `model` field is only truly required when there is no parent model to inherit from (which cannot happen, since `create_agent` is always called from within a running agent).

**`fewShotExamples`:** Injected as synthetic user/assistant message pairs in the child's conversation history, before the `task` message. This dramatically improves output quality for dynamic agents by showing the model concrete examples of expected behavior. Example:

```
[system prompt]
[few-shot user 1] → [few-shot assistant 1]
[few-shot user 2] → [few-shot assistant 2]
[task message]     → (agent generates response)
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

**For agent children (`create_agent` / `invoke_agent`):**

1. Dispatch tool `execute` function returns a `DispatchSentinel` immediately
2. Agent loop detects the sentinel after the step, stops the loop
3. The dispatch handler:
   - Validates nesting depth (rejects if at max)
   - Validates the referenced agent belongs to the same org
   - Creates new `agent_executions` record (status: 'running', `parent_execution_id` set)
   - Saves sentinel as tool output message to parent's execution
   - Snapshots parent's session state (`currentNodeId`, `structuredOutputs`)
   - Inserts stack entry into `agent_stack_entries`
   - Posts to `/internal/execute-child` and **waits for 2xx acknowledgment** before proceeding
   - If POST fails: rolls back (deletes stack entry, marks child execution as failed), returns error to agent loop
4. Parent's serverless instance terminates (only after confirmed child start)
5. Child instance runs first turn with `task` as initial user message

**For workflow children (`invoke_workflow`):**

1-2. Same sentinel detection
3. The dispatch handler:
   - Validates the workflow belongs to the same org
   - Validates workflow has no `user_reply` nodes
   - **Executes the workflow in-process** (no HTTP dispatch, no new instance)
   - Returns the terminal node output directly as the tool result
4. The agent loop continues with the workflow result — no stack push, no terminate-and-resume

---

## Resume Mechanism

When a child agent completes (via `finish` tool) or when an agent child is dispatched, serverless instances must coordinate. This uses a **two-layer approach**: direct HTTP POST for the fast path, with a durable `pending_resumes` table as the reliability layer.

### Pending Resumes Table

```sql
CREATE TABLE pending_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id),
  parent_execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_tool_output_message_id uuid NOT NULL,
  child_output text NOT NULL,
  child_status text NOT NULL CHECK (child_status IN ('success', 'error')),
  parent_session_state jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: one resume per parent execution
  UNIQUE(parent_execution_id)
);

CREATE INDEX idx_pending_resumes_status ON pending_resumes(status) WHERE status = 'pending';
```

### Child Start (after parent dispatches agent child)

The parent's dispatch handler:

1. POSTs to `/internal/execute-child` with the child's config, auth context (`orgId`, `apiKeyId`, `executionKeyId`), and initial message
2. **Waits for 2xx response** (the child endpoint returns 2xx immediately upon accepting the work, before executing)
3. If 2xx: parent terminates
4. If non-2xx or timeout: parent rolls back (delete stack entry, mark child failed, return error to agent loop)

The child endpoint is **idempotent**: it checks if the execution already exists (by `executionId`) before starting. Duplicate POSTs are safe.

### Parent Resume (after child completes)

The child's completion handler:

1. Writes a row to `pending_resumes` (durable intent — survives any subsequent failure)
2. Updates parent's tool output message in `agent_execution_messages`
3. Deletes the stack entry (pop)
4. Restores parent session state on `agent_sessions`
5. Marks child execution as completed
6. Attempts direct `POST /internal/resume-parent`
7. If POST succeeds: marks `pending_resumes` row as `completed`
8. If POST fails: row stays `pending` — the resume worker will pick it up

### Resume Worker

A background worker (or pg_cron job) runs every 5 seconds:

```sql
SELECT * FROM pending_resumes
WHERE status = 'pending'
  AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '5 seconds')
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED
```

For each pending resume:
1. Set status = 'processing', increment attempts, set last_attempt_at
2. POST to `/internal/resume-parent`
3. If success: set status = 'completed'
4. If failure and attempts < 10: set status = 'pending' (will retry)
5. If failure and attempts >= 10: set status = 'failed', mark parent execution as failed

The resume endpoint is **idempotent**: it checks if the parent is already resumed (execution status, stack state) before processing.

---

## Child Failure Detection

Children can fail in multiple ways. The system uses a layered detection approach, with timeout as the last resort.

### Layer 1: Catch crashes in the child's serverless instance

The child execution handler wraps all work in a try/catch. On any uncaught exception:
1. Mark child's `agent_executions.status = 'failed'` with error message
2. Write a `pending_resumes` row with `child_status = 'error'` and the error message as output
3. Update parent's tool output message with the error
4. Delete the stack entry, restore parent session state
5. Attempt direct `POST /internal/resume-parent`

This handles: runtime exceptions, model API failures, MCP tool failures, out-of-memory, etc.

### Layer 2: Detect child start failure

If `/internal/execute-child` returns non-2xx, the parent (still alive at this point) rolls back:
1. Delete stack entry, mark child execution as failed
2. Return error to agent loop (dispatch tool "failed")
3. Parent continues or surfaces the error

### Layer 3: Timeout (last resort)

A configurable timeout per agent, with a default of **10 minutes**. Stored in `AgentConfig` as `childTimeout` (in seconds). Displayed and editable in the agent editor UI with an explicit default value shown.

**Implementation:** A scheduled job (pg_cron) runs every minute:

```sql
SELECT ase.id, ase.session_id, ase.execution_id, ase.parent_execution_id,
       ase.parent_tool_output_message_id, ase.parent_session_state
FROM agent_stack_entries ase
JOIN agent_executions ae ON ae.id = ase.execution_id
WHERE ae.status = 'running'
  AND ase.dispatched_at + interval '1 second' * <childTimeout> < now()
  AND NOT EXISTS (
    SELECT 1 FROM pending_resumes pr
    WHERE pr.parent_execution_id = ase.parent_execution_id
      AND pr.status IN ('pending', 'processing')
  )
```

For each timed-out entry:
1. Mark child as failed: `agent_executions.status = 'failed'`, error: `'Child execution timed out'`
2. Write `pending_resumes` row with error status
3. Delete stack entry, restore parent session state
4. The resume worker handles the actual parent resumption

The timeout is the **last resort** — Layers 1 and 2 should catch the vast majority of failures immediately.

---

## Session Locking

**For user-facing requests** (external API calls, simulate): Keep existing `FOR UPDATE NOWAIT`. If locked, return 429 immediately — the client retries.

**For internal/system requests** (resume-parent, execute-child): Use `FOR UPDATE` with a `statement_timeout` of 10 seconds. These operations must not fail silently — they retry via the `pending_resumes` worker if they can't acquire the lock immediately.

This split prevents internal coordination from competing with user-facing requests in a way that causes hard failures.

---

## Sub-project 3: Execution Model / Session Nesting

### Schema Changes

**New table:** `agent_stack_entries` (see Core Abstraction section above)

**New table:** `pending_resumes` (see Resume Mechanism section above)

**`agent_executions` — new columns:**
- `parent_execution_id` uuid REFERENCES agent_executions(id) — null for top-level, set for children
- `is_dynamic_child` boolean DEFAULT false — true for `create_agent` children (no slug)

**Indexes:**
- `CREATE INDEX idx_agent_executions_parent ON agent_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL`
- `CREATE INDEX idx_agent_executions_top_level ON agent_executions(org_id, agent_id, version) WHERE parent_execution_id IS NULL AND status = 'completed'` — supports the execution summary view

### Dispatch Sequence (Agent Children)

1. Parent calls `__system_invoke_agent({ agentSlug: 'recipe-bot', task: 'Generate a pasta recipe' })`
2. `execute` function returns `DispatchSentinel`
3. Agent loop detects sentinel, stops loop
4. Dispatch handler:
   - Resolves agent config from slug (must be same org)
   - Creates new `agent_executions` record (status: 'running', `parent_execution_id` set)
   - Saves sentinel as tool output message to parent's execution
   - Snapshots parent session state, inserts stack entry
   - Posts to `/internal/execute-child`, waits for 2xx ack
   - On failure: rolls back stack entry and child execution
5. Parent's execution stays status: 'running' (suspended)
6. Parent instance terminates
7. Child instance starts → inserts `task` as user message → runs child's first turn
8. Child responds with text → instance terminates → client sees child's response
9. User sends next message → routed to child (stack top) → child continues
10. Child calls `__system_finish(output, status)` → Layers 1-3 completion flow → resume parent

### Dispatch Sequence (Workflow Children — In-Process)

1. Parent calls `__system_invoke_workflow({ workflowSlug: 'order-flow', user_said: 'return item' })`
2. `execute` function returns `DispatchSentinel`
3. Agent loop detects sentinel
4. Dispatch handler executes the workflow **in-process**:
   - Resolves workflow graph from slug (must be same org)
   - Validates no `user_reply` nodes
   - Calls workflow execution function directly with `user_said` as input
   - Gets terminal node output
5. Returns the output as the tool result — agent loop continues with it
6. No stack push, no terminate-and-resume, no HTTP dispatch

### Cost Tracking

Each child execution tracks its own costs in `agent_executions`. Parent does NOT aggregate child costs into its own totals. The UI displays child cost on the dispatching node with a drill-down link.

**Dynamic children (`create_agent`):** Use the parent's `agent_id` with `is_dynamic_child = true`. This keeps cost attribution under the parent agent but allows filtering in analytics.

**`agent_execution_summary` view:** Uses the `idx_agent_executions_top_level` partial index with `WHERE parent_execution_id IS NULL` to exclude child executions from top-level counts.

### Conversation History Isolation

Messages are loaded by `execution_id`, not `session_id`, when a child is active. The current `getSessionMessages` function is modified to accept an optional `executionId` parameter. When provided, it filters by `execution_id` instead of loading all session messages.

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
  org_id uuid NOT NULL,  -- denormalized for fast RLS checks
  sequence integer NOT NULL DEFAULT 0,  -- per-execution counter, set by application
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(execution_id, sequence)
);

CREATE INDEX idx_execution_events_replay ON agent_execution_events(execution_id, sequence);

ALTER TABLE agent_execution_events ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can read events (uses denormalized org_id, no join needed)
CREATE POLICY "org_members_select_events" ON agent_execution_events
  FOR SELECT USING (is_org_member(org_id));

-- INSERT: service role only (backend inserts events, bypasses RLS)
```

**Sequence generation:** Application-level per-execution counter. The backend maintains a counter per execution and increments it for each event. This avoids global sequence contention and guarantees monotonic ordering within each execution. The counter is a simple in-memory integer that starts at 0 and increments — no database round-trip needed for sequence allocation.

**`org_id` denormalization:** The `org_id` column is copied from `agent_executions` at insert time. This avoids the expensive JOIN in the SELECT RLS policy that was flagged in the scalability review.

### Event Persistence Scope

**Production API path:** All events are persisted. Replay is needed for SSE handoff during child dispatch/resume.

**Simulate (preview) path:** Events are NOT persisted by default. The simulate path is ephemeral — no session, no execution records, no replay needed. A `persistEvents` flag on the execution context controls this. This eliminates unnecessary write load during development/testing.

### New Event Types

- `child_dispatched` — emitted by parent before terminating: `{ childExecutionId, childAgentSlug?, childAppType, task }`
- `child_completed` — emitted by child on completion: `{ parentExecutionId, output, status }`

All existing event types remain unchanged and also get persisted (in production path).

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
- For workflows-as-children: executed in-process, result returned in same API call. No SSE involvement.

---

## Tenant-Level Cost Budget Validation

A cost validation function is called before each LLM call in the agent loop. For the MVP, this is a skeleton that always allows execution:

```typescript
// packages/api/src/core/costGuard.ts

interface CostCheckParams {
  orgId: string;
  tenantId: string;
  currentCostUSD: number;
}

// TODO: Implement tenant-level cost budget validation.
// This should check the tenant's configured budget against accumulated cost
// (across all executions in the current billing period) and reject if exceeded.
// For now, always allows execution.
export async function validateTenantCostBudget(params: CostCheckParams): Promise<boolean> {
  return true;
}
```

Called in the agent loop after each step, passing the cumulative cost so far. If it returns `false`, the agent loop auto-finishes with `status: 'error'` and `output: 'Tenant cost budget exceeded.'` This applies to both top-level and child agents.

---

## Execution Data Capture (Agent Parity Fix)

### Problem

Workflows currently capture comprehensive execution data for debugging (full prompts, raw model responses, reasoning, tool calls with results). Agents capture prompts and tool calls but are missing:
- Raw model response objects (only `responseText` is stored, not the full response)
- Reasoning / extended thinking output
- Per-step duration
- Error details per step

This gap affects both standalone agents and sub-agents. The fix brings agent capture to full parity with workflows.

### What Must Be Captured Per Agent Step

Every agent loop step must persist ALL of the following to `agent_execution_nodes`:

| Field | Column | Currently captured? | Fix |
|-------|--------|-------------------|-----|
| Full messages sent to model | `messages_sent` (JSONB) | Yes (`messagesSent`) | No change |
| Raw model response (full objects) | `response` (JSONB) | **No** — only `responseText` + `toolCalls` | Add `responseMessages` to `AgentStepEvent` and persist in `buildStepResponse` |
| Reasoning / extended thinking | `response` (JSONB) | **No** | Add `reasoning` field to `AgentStepEvent`, include in response JSONB |
| Tool calls with inputs | `response` (JSONB) | Yes (via `toolCalls`) | No change |
| Tool call results/outputs | `response` (JSONB) | Yes (via `toolCalls[].output`) | No change |
| Token usage (input/output/cached) | Dedicated columns | Yes | No change |
| Cost per step | `cost` column | Yes | No change |
| Duration per step | `duration_ms` column | **No** — always stored as 0 | Pass actual `durationMs` from `AgentStepEvent` |
| Model used | `model` column | Yes | No change |
| Error details | `response` (JSONB) | **No** | Add `error` field to `AgentStepEvent`, include in response JSONB |

### Changes to `AgentStepEvent`

```typescript
// Current:
interface AgentStepEvent {
  step: number;
  messagesSent: ModelMessage[];
  responseText: string;
  toolCalls: AgentToolCallRecord[];
  tokens: TokenLog;
  durationMs: number;
}

// Updated:
interface AgentStepEvent {
  step: number;
  messagesSent: ModelMessage[];
  responseText: string;
  responseMessages: unknown[];    // NEW: full raw model response objects
  reasoning?: string;             // NEW: extended thinking / chain-of-thought
  toolCalls: AgentToolCallRecord[];
  tokens: TokenLog;
  durationMs: number;
  error?: string;                 // NEW: error details for this step
}
```

### Changes to `buildStepResponse`

```typescript
// Current:
function buildStepResponse(stepEvent: AgentStepEvent | undefined): unknown {
  if (stepEvent === undefined) return {};
  return { text: stepEvent.responseText, toolCalls: stepEvent.toolCalls };
}

// Updated:
function buildStepResponse(stepEvent: AgentStepEvent | undefined): unknown {
  if (stepEvent === undefined) return {};
  return {
    text: stepEvent.responseText,
    toolCalls: stepEvent.toolCalls,
    responseMessages: stepEvent.responseMessages,
    reasoning: stepEvent.reasoning,
    error: stepEvent.error,
  };
}
```

### Changes to Agent Loop (`agentLoop.ts`)

The `onStepProcessed` callback must include the new fields:

```typescript
callbacks.onStepProcessed({
  step: params.stepNum,
  messagesSent: [...state.messages],
  responseText: params.result.text,
  responseMessages: params.result.responseMessages,  // NEW
  reasoning: params.result.reasoning,                 // NEW
  toolCalls: params.result.toolCalls,
  tokens: params.result.tokens,
  durationMs: params.durationMs,
  error: params.result.error,                         // NEW
});
```

### Changes to Duration Tracking

Currently, `agentExecutionPersistence.ts` passes `durationMs: ZERO` for every step. Fix: use the actual `stepEvent.durationMs` value which is already computed in the agent loop.

### Sub-agent and Sub-workflow Capture

**Sub-agents:** Run through the same agent loop, so they automatically get the same capture improvements. No additional work needed.

**Sub-workflows (in-process):** Run through the existing workflow execution path (`executeWithCallbacks`), which already captures comprehensive data. The in-process execution returns `FlowResult` with `parsedResults`, `debugMessages`, and `toolCalls`. These are persisted using the same `persistNodeVisits` function as standalone workflows. No additional work needed — sub-workflows inherit full workflow capture.

### SSE Event Enhancement

The `step_processed` SSE event for agents should also include the new fields so the client-side debug view can show them in real-time:

```typescript
// Updated step_processed SSE event payload
{
  type: 'step_processed',
  step: number,
  responseText: string,
  responseMessages: unknown[],  // NEW
  reasoning?: string,           // NEW
  toolCalls: AgentToolCallRecord[],
  tokens: TokenLog,
  durationMs: number,
  error?: string,               // NEW
}
```

---

## File Changes Summary

### New files
- `packages/api/src/tools/finishTool.ts` — The `__system_finish` tool definition with `FinishSentinel`
- `packages/api/src/tools/dispatchTools.ts` — `__system_create_agent`, `__system_invoke_agent`, `__system_invoke_workflow` with `DispatchSentinel`
- `packages/api/src/types/agentConfig.ts` — Unified `AgentConfig` interface (stored config shape)
- `packages/api/src/core/agentStack.ts` — Stack push/pop/routing logic via `agent_stack_entries` table
- `packages/api/src/core/childDispatcher.ts` — Dispatch orchestration, child start, parent resume
- `packages/api/src/core/sentinelDetector.ts` — Post-step sentinel detection in tool results
- `packages/api/src/core/costGuard.ts` — Tenant-level cost budget validation skeleton (TODO)
- `packages/backend/src/routes/internal/executeChildHandler.ts` — `/internal/execute-child` endpoint (idempotent)
- `packages/backend/src/routes/internal/resumeParentHandler.ts` — `/internal/resume-parent` endpoint (idempotent)
- `packages/backend/src/workers/resumeWorker.ts` — Background worker processing `pending_resumes`
- `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx` — Breadcrumb navigation for nested executions
- `supabase/migrations/YYYYMMDD_agent_composition.sql` — Schema changes (agent_stack_entries, pending_resumes, parent_execution_id, agent_execution_events)

### Modified files
- `packages/api/src/agentLoop/agentLoop.ts` — Post-step sentinel detection, new exit conditions for finish/dispatch, populate new AgentStepEvent fields, auto-finish on maxSteps for children, call validateTenantCostBudget
- `packages/api/src/agentLoop/agentLoopTypes.ts` — `AgentLoopResult` extended with `dispatchResult?` and `finishResult?` fields; `AgentStepEvent` extended with `responseMessages`, `reasoning`, `error`
- `packages/api/src/core/index.ts` — Workflow terminal node triggers child completion flow when session has parent; in-process workflow execution for `invoke_workflow`
- `packages/api/src/core/toolCallExecutor.ts` — Inject system tools alongside MCP tools
- `packages/api/src/stateMachine/index.ts` — Inject dispatch tools into workflow node tool sets via `toolsByEdge` augmentation
- `packages/backend/src/routes/execute/executeHandler.ts` — Stack-based message routing, dispatch/resume orchestration, split locking (NOWAIT for users, FOR UPDATE for internal)
- `packages/backend/src/routes/execute/executePersistence.ts` — Persist events to `agent_execution_events`, handle stack updates via `agent_stack_entries`
- `packages/backend/src/routes/execute/executeFetcher.ts` — Load stack top from `agent_stack_entries`, execution-scoped message retrieval
- `packages/backend/src/routes/execute/executeAgentPath.ts` — Dispatch detection, MCP config inheritance
- `packages/backend/src/routes/execute/agentExecutionPersistence.ts` — `buildStepResponse` updated to include responseMessages, reasoning, error; pass actual durationMs
- `packages/backend/src/db/queries/executionQueries.ts` — `parent_execution_id` in `createExecution`, stack entry CRUD, execution-scoped `getSessionMessages`, `pending_resumes` operations
- `packages/backend/src/routes/simulateHandler.ts` — Same dispatch/resume flow for simulate path (without event persistence)
- `packages/backend/src/routes/simulateAgentHandler.ts` — Same for agent simulate
- `packages/backend/src/routes/simulate.ts` — Conditional event persistence based on `persistEvents` flag
- `packages/backend/src/routes/simulateAgentSse.ts` — Same conditional persistence
- `packages/backend/src/server.ts` — Register `/internal/execute-child` and `/internal/resume-parent` routes
- `packages/web/app/hooks/useSimulation.ts` — SSE connection stack management
- `packages/web/app/lib/api.ts` — Replay support (`?after=`), new event types, connection stack state machine
- `packages/web/app/components/dashboard/node-inspector/` — Child execution display + drill-down link
- `packages/web/app/components/agent-editor/` — Child timeout configuration field, nesting depth configuration

### Schema changes
- New table: `agent_stack_entries` with indexes
- New table: `pending_resumes` with indexes
- New table: `agent_execution_events` with RLS policies and indexes
- `agent_executions` — add `parent_execution_id uuid REFERENCES agent_executions(id)`, add `is_dynamic_child boolean DEFAULT false`
- `agent_executions` — add index `idx_agent_executions_parent` on `parent_execution_id`
- `agent_executions` — add partial index `idx_agent_executions_top_level` for summary view
- `agent_execution_summary` view — add `WHERE parent_execution_id IS NULL` filter
- `agent_execution_messages` — add UPDATE policy for service role (to replace sentinel with child output)
