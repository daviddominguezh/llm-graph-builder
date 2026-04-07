# Agent/Workflow Composition

This document describes the agent/workflow composition system — the ability for agents and workflows to invoke each other via tool calls, forming nested execution hierarchies.

## What's Now Possible

- **An agent can create and dispatch a dynamic sub-agent** (`create_agent`) with an inline system prompt, model, tools, and task. The child runs independently, interacts with the user if needed, and returns its output to the parent.
- **An agent can invoke a predefined agent** (`invoke_agent`) by slug and version. The child agent's own config is loaded from the database, optionally augmented with parent-provided context items and model overrides.
- **An agent can invoke a predefined workflow** (`invoke_workflow`) by slug and version. Workflows execute in-process (no HTTP dispatch) and return their terminal node output immediately.
- **Workflows can also dispatch agents and other workflows** using the same three tools, injected into every workflow node's tool set.
- **Nesting is unlimited** (default max depth: 10, configurable per agent). Agent A can invoke Agent B, which invokes Agent C, and so on.
- **Multi-turn child agents** interact with the user directly. The parent suspends, and the user's messages route to the active child until it calls `finish`.
- **The external API caller never changes endpoint or session ID.** An agent stack manages routing transparently.

## Architecture Overview

### The Agent Stack

Every session has an agent stack, stored as rows in the `agent_stack_entries` table. Messages always route to the topmost entry. The external client is unaware of the nesting.

```
Initial state:        stack = []                    (root agent handles messages)
Parent dispatches B:  stack = [EntryB]              (B handles messages)
B dispatches C:       stack = [EntryB, EntryC]      (C handles messages)
C calls finish:       stack = [EntryB]              (B resumes, handles messages)
B calls finish:       stack = []                    (root agent resumes)
```

Each stack entry contains:
- The child's execution ID and resolved agent config
- The parent's execution ID and tool output message ID (for sentinel replacement)
- A snapshot of the parent's session state (currentNodeId, structuredOutputs) for restoration on resume
- The dispatch timestamp (for timeout detection)

### Sentinel-Based Tool Interception

The four system tools (`finish`, `create_agent`, `invoke_agent`, `invoke_workflow`) don't execute real work. Their `execute` functions return **sentinel objects** — special markers that the agent loop detects after each step.

```typescript
// Finish sentinel — signals child completion
{ __sentinel: 'finish', output: '...', status: 'success' | 'error' }

// Dispatch sentinel — signals child dispatch
{ __sentinel: 'dispatch', type: 'create_agent' | 'invoke_agent' | 'invoke_workflow', params: {...} }
```

After each `generateText` call, the agent loop inspects tool results for sentinels (finish takes priority). If found, the loop stops and returns the sentinel to the caller for orchestration.

### Execution Flow: Agent Child

```
1. Parent agent calls invoke_agent({ agentSlug: 'recipe-bot', version: 'latest', task: '...' })
2. Tool returns DispatchSentinel → agent loop stops
3. Dispatch handler:
   a. Creates child execution record (status: 'running', parent_execution_id set)
   b. Stores sentinel as tool output message
   c. Snapshots parent session state
   d. Pushes stack entry
   e. POSTs to /internal/execute-child (waits for 2xx ack)
4. Parent instance terminates
5. Child instance starts → runs first turn with 'task' as user message
6. Child responds with text → instance terminates → user sees response
7. User sends messages → routed to child (stack top)
8. Child calls finish(output, status) → completion flow:
   a. Writes pending_resumes row (durable intent)
   b. Updates parent's tool output message with child's output
   c. Pops stack entry, restores parent session state
   d. POSTs to /internal/resume-parent
9. Parent resumes on new instance, sees tool call → tool result pair, continues
```

### Execution Flow: Workflow Child

Workflow children execute **in-process** within the parent's serverless instance. No HTTP dispatch, no new instance, no terminate-and-resume. The parent calls the workflow execution function directly and gets the terminal node output.

### Resume Mechanism

A two-layer approach ensures reliability:

1. **Direct HTTP POST** — The fast path. Child completion handler POSTs to `/internal/resume-parent`.
2. **Durable `pending_resumes` table** — The reliability layer. A resume intent row is written before attempting the POST. A background worker polls every 5 seconds and retries failed resumes (up to 10 attempts).

### Child Failure Detection

Three layers, from fastest to slowest:

1. **Layer 1: Crash catch** — Child execution wraps all work in try/catch. On any uncaught exception, the child writes an error resume intent and triggers parent resumption with `status: 'error'`.
2. **Layer 2: Start failure** — If `/internal/execute-child` returns non-2xx, the parent (still alive) rolls back the stack entry and returns an error to the agent loop.
3. **Layer 3: Timeout** — A configurable timeout (default 10 minutes, editable in UI). A pg_cron job runs every minute to detect orphaned children and trigger error resumption.

## System Tools

### `finish`

Available only to child agents (not top-level). Signals task completion.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output` | string | yes | The final output to return to the parent |
| `status` | `'success'` \| `'error'` | yes | Whether the task completed successfully |

When called, the agent loop stops immediately and triggers the child completion flow.

**maxSteps auto-finish:** If a child agent hits its step limit without calling `finish`, the system auto-finishes with `status: 'error'` and `output: 'Agent reached maximum step limit without completing the task.'`

### `create_agent`

Dynamically defines and dispatches an agent inline. The agent is ephemeral — it does not appear in the UI app list and is cleaned up on completion or crash.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `systemPrompt` | string | yes | The agent's system prompt |
| `task` | string | yes | Initial instruction (first user message) |
| `model` | string | no | LLM model (defaults to parent's model) |
| `tools` | `'all'` \| `string[]` | no | Tool access: all parent tools or explicit list |
| `contextItems` | `string[]` | no | Context items to inject |
| `maxSteps` | number | no | Maximum steps before auto-finish |
| `outputSchema` | object | no | JSON Schema to validate the finish output |

### `invoke_agent`

Dispatches a predefined agent by slug and version.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agentSlug` | string | yes | The agent's slug |
| `version` | number \| `'latest'` | yes | Which published version |
| `task` | string | yes | Initial instruction (first user message) |
| `contextItems` | `string[]` | no | Additional context (concatenated with agent's own) |
| `model` | string | no | Override the agent's configured model |
| `outputSchema` | object | no | JSON Schema to validate the finish output |

### `invoke_workflow`

Dispatches a predefined workflow by slug and version. Executes in-process (no HTTP dispatch).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflowSlug` | string | yes | The workflow's slug |
| `version` | number \| `'latest'` | yes | Which published version |
| `user_said` | string | yes | Initial input for workflow routing |
| `contextItems` | `string[]` | no | Additional context |
| `model` | string | no | Override the workflow's model |

## Unified AgentConfig Interface

A single TypeScript interface shared between the UI agent editor, the `create_agent` tool, and the execution layer:

```typescript
interface AgentConfig {
  systemPrompt: string;
  model?: string;
  maxSteps?: number | null;
  contextItems?: ContextItem[];        // string[]
  mcpServers?: McpServerConfig[];
  skills?: SkillDefinition[];
  fewShotExamples?: FewShotExample[];  // { input, output }[]
  childTimeout?: number;               // seconds, default 600
  maxNestingDepth?: number;            // default 10
}
```

When new capabilities are added (VFS, memory, sandboxes), they are added to this interface once. Both UI-created agents and dynamically created agents automatically support them.

## Tool Name Conflicts

System tools use reserved names (`finish`, `create_agent`, `invoke_agent`, `invoke_workflow`). If an MCP server exposes a tool with one of these names, it is rejected at session creation time with a warning logged. This prevents collisions between user-defined tools and system tools.

## Context and Communication

**Parent to child:**
- `task` / `user_said` — the initial instruction (inserted as first user message)
- `contextItems` — additional context strings (concatenated with the child's own for predefined agents)
- `fewShotExamples` — synthetic conversation examples injected before the task

**Child to parent:**
- `finish` output — the final result string
- Structured error responses on failure (error code, steps completed, last tool call, partial output)

**Child system prompt injection:**
Child agents receive XML-tagged completion instructions at both the start and end of their system prompt:

```xml
<system-instructions>
You are a sub-agent dispatched to complete a specific task. When you have fully
completed your task, you MUST call the `finish` tool with your final output...
</system-instructions>
```

## Execution Data Capture

Agent execution data capture was brought to full parity with workflow capture:

| Data | Before | After |
|------|--------|-------|
| Full prompts sent to model | Yes | Yes |
| Raw model response objects | No (only responseText) | **Yes** |
| Reasoning / extended thinking | No | **Yes** |
| Tool calls with results | Yes | Yes |
| Duration per step | No (always 0) | **Yes** |
| Error details per step | No | **Yes** |

Sub-agents inherit these improvements automatically. Sub-workflows use the existing workflow capture path (already comprehensive).

## Database Schema

### New Tables

**`agent_stack_entries`** — One row per active child in the nesting stack.

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | uuid | FK to agent_sessions |
| `depth` | integer | Nesting level (0 = first child) |
| `execution_id` | uuid | The child's execution |
| `parent_execution_id` | uuid | The parent's execution |
| `parent_tool_output_message_id` | uuid | Message to update on completion |
| `parent_session_state` | jsonb | Snapshot for restoration |
| `agent_config` | jsonb | Resolved child config |
| `app_type` | text | 'agent' or 'workflow' |
| `dispatched_at` | timestamptz | For timeout detection |

Push = INSERT, Pop = DELETE, Get top = SELECT ORDER BY depth DESC LIMIT 1.

**`pending_resumes`** — Durable resume intents for reliability.

| Column | Type | Description |
|--------|------|-------------|
| `parent_execution_id` | uuid | Which parent to resume (unique) |
| `child_output` | text | The child's finish output |
| `child_status` | text | 'success' or 'error' |
| `parent_session_state` | jsonb | State to restore |
| `status` | text | pending / processing / completed / failed |
| `attempts` | integer | Retry count |

**`agent_execution_events`** — SSE event persistence for replay.

| Column | Type | Description |
|--------|------|-------------|
| `execution_id` | uuid | Which execution |
| `org_id` | uuid | Denormalized for fast RLS |
| `sequence` | integer | Per-execution counter |
| `event_type` | text | Event type name |
| `payload` | jsonb | Event data |

### Modified Tables

**`agent_executions`:**
- `parent_execution_id` — FK to self (null for top-level)
- `is_dynamic_child` — Boolean for `create_agent` children

## SSE Event Handling

Two new SSE event types:

- **`child_dispatched`** — Emitted by parent before terminating: `{ childExecutionId, childAppType, task }`
- **`child_completed`** — Emitted by child on completion: `{ parentExecutionId, output, status }`

Event persistence supports replay via `?after=<sequence>` parameter on the SSE endpoint. Events are persisted for the production API path but skipped for the simulate (preview) path.

## Dashboard / Debug View

- **Parent execution view:** Nodes that dispatched a child show aggregated cost, status, output, and a drill-down link.
- **Child execution view:** Same debug UI, loaded with the child's execution ID.
- **Breadcrumb navigation:** `ExecutionBreadcrumb` component shows the full chain: `Parent > Agent B > Agent C`. Built from `parent_execution_id` traversal.

## Session Locking

- **User-facing requests:** `FOR UPDATE NOWAIT` — immediate 429 if locked.
- **Internal requests** (resume, execute-child): `FOR UPDATE` with `statement_timeout` — retries via the pending_resumes worker.

## Cost Budget

A `validateTenantCostBudget` function is called in the agent loop (currently a skeleton that always returns `true`). When implemented, it will check per-tenant cost limits and auto-finish agents that exceed their budget.

## File Reference

### New files

| File | Purpose |
|------|---------|
| `packages/api/src/types/sentinels.ts` | Sentinel types and type guards |
| `packages/api/src/types/agentConfig.ts` | Unified AgentConfig interface |
| `packages/api/src/tools/finishTool.ts` | `finish` tool |
| `packages/api/src/tools/dispatchTools.ts` | `create_agent/invoke_agent/invoke_workflow` |
| `packages/api/src/tools/systemToolInjector.ts` | Injects system tools, filters conflicts |
| `packages/api/src/core/sentinelDetector.ts` | Post-step sentinel detection |
| `packages/api/src/core/costGuard.ts` | Tenant cost budget skeleton |
| `packages/backend/src/routes/internal/internalAuth.ts` | Service-key auth middleware |
| `packages/backend/src/routes/internal/internalRouter.ts` | Internal route registration |
| `packages/backend/src/routes/internal/executeChildHandler.ts` | `/internal/execute-child` |
| `packages/backend/src/routes/internal/resumeParentHandler.ts` | `/internal/resume-parent` |
| `packages/backend/src/workers/resumeWorker.ts` | Background resume retry worker |
| `packages/backend/src/db/queries/stackQueries.ts` | Agent stack CRUD |
| `packages/backend/src/db/queries/resumeQueries.ts` | Pending resume CRUD |
| `packages/backend/src/db/queries/eventQueries.ts` | Event persistence |
| `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx` | Breadcrumb navigation |
| `supabase/migrations/20260403100000_agent_composition.sql` | Schema changes |

### Modified files

| File | Changes |
|------|---------|
| `packages/api/src/agentLoop/agentLoopTypes.ts` | `AgentStepEvent` + `AgentLoopResult` + `AgentLoopConfig` extended |
| `packages/api/src/agentLoop/agentLoop.ts` | Sentinel detection, maxSteps auto-finish |
| `packages/api/src/agentLoop/agentLoopHelpers.ts` | Few-shot injection, child prompt injection |
| `packages/api/src/agentLoop/agentLlmCaller.ts` | Reasoning extraction |
| `packages/backend/src/routes/execute/executeHandler.ts` | Stack-based routing structure |
| `packages/backend/src/routes/execute/executeFetcher.ts` | Stack top loading |
| `packages/backend/src/routes/execute/agentExecutionPersistence.ts` | Full response + duration |
| `packages/backend/src/routes/simulateAgentSse.ts` | Enhanced SSE events |
| `packages/backend/src/db/queries/executionQueries.ts` | Composition query support |
| `packages/backend/src/server.ts` | Internal router + resume worker |
| `packages/web/app/lib/api.ts` | New SSE event types |

## Design Documents

- **Spec:** `docs/superpowers/specs/2026-04-03-agent-workflow-composition-design.md`
- **Plan A (Data Capture):** `docs/superpowers/plans/2026-04-03-execution-data-capture.md`
- **Plan B (Composition):** `docs/superpowers/plans/2026-04-03-agent-workflow-composition.md`
