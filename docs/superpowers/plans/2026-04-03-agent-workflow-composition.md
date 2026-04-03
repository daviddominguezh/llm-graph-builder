# Agent/Workflow Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents and workflows to invoke each other via tool calls using an event-driven serverless continuation model with an agent stack for session routing.

**Architecture:** Three system tools (`__system_create_agent`, `__system_invoke_agent`, `__system_invoke_workflow`) and a `__system_finish` tool use sentinel-based interception in the agent loop. An `agent_stack_entries` table manages parent/child routing. Workflow children execute in-process; agent children dispatch to new serverless instances via HTTP with a `pending_resumes` table for reliability. Parent resumption is triggered by child completion.

**Tech Stack:** TypeScript, AI SDK (`ai` package), Express, Supabase (PostgreSQL, pg_cron), Next.js, React, @xyflow/react

**Spec:** `docs/superpowers/specs/2026-04-03-agent-workflow-composition-design.md`

**Prerequisite:** Plan A (Execution Data Capture) should be completed first so agent step events include `responseMessages`, `reasoning`, and `error`.

---

## File Map

### New files (packages/api)
| File | Responsibility |
|------|---------------|
| `src/types/agentConfig.ts` | Unified `AgentConfig` interface, `FewShotExample`, `ContextItem` type |
| `src/types/sentinels.ts` | `DispatchSentinel`, `FinishSentinel` types, type guards |
| `src/tools/finishTool.ts` | `__system_finish` tool definition returning `FinishSentinel` |
| `src/tools/dispatchTools.ts` | `__system_create_agent`, `__system_invoke_agent`, `__system_invoke_workflow` returning `DispatchSentinel` |
| `src/tools/systemToolInjector.ts` | Injects system tools into agent/workflow tool sets |
| `src/core/sentinelDetector.ts` | Post-step sentinel detection in tool results |
| `src/core/costGuard.ts` | Tenant-level cost budget validation skeleton |

### New files (packages/backend)
| File | Responsibility |
|------|---------------|
| `src/routes/internal/internalAuth.ts` | Service-key auth middleware for internal endpoints |
| `src/routes/internal/executeChildHandler.ts` | `/internal/execute-child` endpoint (idempotent) |
| `src/routes/internal/resumeParentHandler.ts` | `/internal/resume-parent` endpoint (idempotent) |
| `src/routes/internal/internalRouter.ts` | Router for internal endpoints |
| `src/workers/resumeWorker.ts` | Background worker processing `pending_resumes` |
| `src/db/queries/stackQueries.ts` | Agent stack CRUD (push, pop, getTop) |
| `src/db/queries/resumeQueries.ts` | Pending resumes CRUD |
| `src/db/queries/eventQueries.ts` | Execution event persistence |

### New files (packages/web)
| File | Responsibility |
|------|---------------|
| `app/components/dashboard/ExecutionBreadcrumb.tsx` | Breadcrumb navigation for nested executions |

### New files (supabase)
| File | Responsibility |
|------|---------------|
| `migrations/YYYYMMDD_agent_composition.sql` | Schema: agent_stack_entries, pending_resumes, agent_execution_events, parent_execution_id |

### Modified files
| File | Changes |
|------|---------|
| `packages/api/src/agentLoop/agentLoop.ts` | Sentinel detection after each step, maxSteps auto-finish for children, cost guard |
| `packages/api/src/agentLoop/agentLoopTypes.ts` | `AgentLoopResult` extended with `dispatchResult?`, `finishResult?` |
| `packages/backend/src/server.ts` | Register internal router |
| `packages/backend/src/routes/execute/executeHandler.ts` | Stack-based message routing |
| `packages/backend/src/routes/execute/executeFetcher.ts` | Load stack top, execution-scoped messages |
| `packages/backend/src/routes/execute/executePersistence.ts` | Event persistence |
| `packages/backend/src/db/queries/executionQueries.ts` | `parent_execution_id`, execution-scoped `getSessionMessages` |
| `packages/web/app/lib/api.ts` | New SSE event types, replay support |
| `packages/web/app/hooks/useSimulation.ts` | SSE connection stack |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260403000000_agent_composition.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260403000000_agent_composition.sql`:

```sql
-- Agent/Workflow Composition schema changes

-- 1. Agent stack entries (replaces JSONB column approach)
CREATE TABLE agent_stack_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  depth integer NOT NULL,
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_execution_id uuid REFERENCES agent_executions(id),
  parent_tool_output_message_id uuid,
  parent_session_state jsonb,
  agent_config jsonb NOT NULL,
  app_type text NOT NULL CHECK (app_type IN ('agent', 'workflow')),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, depth)
);

CREATE INDEX idx_stack_entries_session ON agent_stack_entries(session_id);
CREATE INDEX idx_stack_entries_execution ON agent_stack_entries(execution_id);

ALTER TABLE agent_stack_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_stack_entries" ON agent_stack_entries
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Pending resumes (durable resume intent)
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
  UNIQUE(parent_execution_id)
);

CREATE INDEX idx_pending_resumes_status ON pending_resumes(status) WHERE status = 'pending';

ALTER TABLE pending_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pending_resumes" ON pending_resumes
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Agent execution events (SSE event persistence)
CREATE TABLE agent_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  org_id uuid NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(execution_id, sequence)
);

CREATE INDEX idx_execution_events_replay ON agent_execution_events(execution_id, sequence);

ALTER TABLE agent_execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_events" ON agent_execution_events
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "service_role_insert_events" ON agent_execution_events
  FOR INSERT WITH CHECK (true);

-- 4. Add parent_execution_id to agent_executions
ALTER TABLE agent_executions ADD COLUMN parent_execution_id uuid REFERENCES agent_executions(id);
ALTER TABLE agent_executions ADD COLUMN is_dynamic_child boolean NOT NULL DEFAULT false;

CREATE INDEX idx_agent_executions_parent ON agent_executions(parent_execution_id)
  WHERE parent_execution_id IS NOT NULL;

CREATE INDEX idx_agent_executions_top_level ON agent_executions(org_id, agent_id, version)
  WHERE parent_execution_id IS NULL AND status = 'completed';

-- 5. Allow UPDATE on agent_execution_messages for sentinel replacement
CREATE POLICY "service_role_update_messages" ON agent_execution_messages
  FOR UPDATE USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260403000000_agent_composition.sql
git commit -m "feat: add agent composition schema (stack, resumes, events)"
```

---

### Task 2: Sentinel types and type guards

**Files:**
- Create: `packages/api/src/types/sentinels.ts`

- [ ] **Step 1: Create sentinel types**

Create `packages/api/src/types/sentinels.ts`:

```typescript
export interface DispatchSentinel {
  __sentinel: 'dispatch';
  type: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
}

export interface FinishSentinel {
  __sentinel: 'finish';
  output: string;
  status: 'success' | 'error';
}

export type Sentinel = DispatchSentinel | FinishSentinel;

export function isDispatchSentinel(value: unknown): value is DispatchSentinel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.__sentinel === 'dispatch';
}

export function isFinishSentinel(value: unknown): value is FinishSentinel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.__sentinel === 'finish';
}

export function isSentinel(value: unknown): value is Sentinel {
  return isDispatchSentinel(value) || isFinishSentinel(value);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w packages/api
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/types/sentinels.ts
git commit -m "feat: add sentinel types for dispatch and finish tools"
```

---

### Task 3: Unified AgentConfig interface

**Files:**
- Create: `packages/api/src/types/agentConfig.ts`

- [ ] **Step 1: Create the interface**

Create `packages/api/src/types/agentConfig.ts`:

```typescript
import type { McpServerConfig } from './mcp.js';

export type ContextItem = string;

export interface FewShotExample {
  input: string;
  output: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  content: string;
}

/**
 * Unified agent configuration interface.
 *
 * Shared between:
 * - UI agent editor (saved to agent_versions.graph_data)
 * - __system_create_agent tool input schema
 * - Execution layer config resolution
 *
 * When adding new capabilities (VFS, memory, sandboxes),
 * add them here once — all consumers automatically support them.
 */
export interface AgentConfig {
  systemPrompt: string;
  model?: string;
  maxSteps?: number | null;
  contextItems?: ContextItem[];
  mcpServers?: McpServerConfig[];
  skills?: SkillDefinition[];
  fewShotExamples?: FewShotExample[];
  childTimeout?: number;    // seconds, default 600
  maxNestingDepth?: number; // default 10
}

export const DEFAULT_CHILD_TIMEOUT_SECONDS = 600;
export const DEFAULT_MAX_NESTING_DEPTH = 10;
```

- [ ] **Step 2: Verify McpServerConfig import resolves**

Check the existing MCP type location:

```bash
npm run typecheck -w packages/api
```

If the import path is wrong, fix it to match the actual location of `McpServerConfig` in the codebase.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/types/agentConfig.ts
git commit -m "feat: add unified AgentConfig interface"
```

---

### Task 4: Cost guard skeleton

**Files:**
- Create: `packages/api/src/core/costGuard.ts`

- [ ] **Step 1: Create the skeleton**

Create `packages/api/src/core/costGuard.ts`:

```typescript
interface CostCheckParams {
  orgId: string;
  tenantId: string;
  currentCostUSD: number;
}

/**
 * Validates whether a tenant's cost budget allows continued execution.
 *
 * TODO: Implement tenant-level cost budget validation.
 * This should check the tenant's configured budget against accumulated cost
 * (across all executions in the current billing period) and reject if exceeded.
 * For now, always allows execution.
 */
export async function validateTenantCostBudget(_params: CostCheckParams): Promise<boolean> {
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/core/costGuard.ts
git commit -m "feat: add tenant cost budget validation skeleton"
```

---

### Task 5: Sentinel detector

**Files:**
- Create: `packages/api/src/core/sentinelDetector.ts`

- [ ] **Step 1: Create the detector**

Create `packages/api/src/core/sentinelDetector.ts`:

```typescript
import type { AgentToolCallRecord } from '@src/agentLoop/agentLoopTypes.js';
import {
  type DispatchSentinel,
  type FinishSentinel,
  isDispatchSentinel,
  isFinishSentinel,
} from '@src/types/sentinels.js';

export interface SentinelDetectionResult {
  type: 'none' | 'finish' | 'dispatch';
  finishSentinel?: FinishSentinel;
  dispatchSentinel?: DispatchSentinel;
}

/**
 * Inspects tool call results for sentinel values after each agent loop step.
 * Returns the first sentinel found (finish takes priority over dispatch).
 */
export function detectSentinels(toolCalls: AgentToolCallRecord[]): SentinelDetectionResult {
  for (const tc of toolCalls) {
    if (isFinishSentinel(tc.output)) {
      return { type: 'finish', finishSentinel: tc.output };
    }
  }

  for (const tc of toolCalls) {
    if (isDispatchSentinel(tc.output)) {
      return { type: 'dispatch', dispatchSentinel: tc.output };
    }
  }

  return { type: 'none' };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/core/sentinelDetector.ts
git commit -m "feat: add sentinel detector for finish and dispatch tools"
```

---

### Task 6: Finish tool definition

**Files:**
- Create: `packages/api/src/tools/finishTool.ts`

- [ ] **Step 1: Create the finish tool**

Create `packages/api/src/tools/finishTool.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

import type { FinishSentinel } from '@src/types/sentinels.js';

const TOOL_NAME = '__system_finish';

const finishToolSchema = z.object({
  output: z.string().describe('The final output to return to the parent agent'),
  status: z.enum(['success', 'error']).describe('Whether the task completed successfully or with an error'),
});

function createFinishTool() {
  return tool({
    description:
      'Signal that you have completed your task. Call this when you are done. ' +
      'Pass your final output and whether you succeeded or encountered an error.',
    parameters: finishToolSchema,
    execute: async (params): Promise<FinishSentinel> => {
      return {
        __sentinel: 'finish',
        output: params.output,
        status: params.status,
      };
    },
  });
}

export { TOOL_NAME as FINISH_TOOL_NAME, createFinishTool };
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/tools/finishTool.ts
git commit -m "feat: add __system_finish tool definition"
```

---

### Task 7: Dispatch tool definitions

**Files:**
- Create: `packages/api/src/tools/dispatchTools.ts`

- [ ] **Step 1: Create dispatch tools**

Create `packages/api/src/tools/dispatchTools.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

import type { DispatchSentinel } from '@src/types/sentinels.js';

const CREATE_AGENT_TOOL_NAME = '__system_create_agent';
const INVOKE_AGENT_TOOL_NAME = '__system_invoke_agent';
const INVOKE_WORKFLOW_TOOL_NAME = '__system_invoke_workflow';

function createAgentTool() {
  return tool({
    description:
      'Create a new agent dynamically and dispatch it to handle a task. ' +
      'You must provide a system prompt and task. The agent will execute independently.',
    parameters: z.object({
      systemPrompt: z.string().describe('The system prompt for the new agent'),
      task: z.string().describe('The task for the agent to complete'),
      model: z.string().optional().describe('The LLM model to use (defaults to your own model)'),
      tools: z.union([z.literal('all'), z.array(z.string())]).optional()
        .describe('Tools to give the agent: "all" for all your tools, or a list of tool names'),
      contextItems: z.array(z.string()).optional().describe('Context items to inject'),
      maxSteps: z.number().optional().describe('Maximum number of steps'),
      outputSchema: z.record(z.unknown()).optional().describe('JSON Schema to validate the agent output'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'create_agent', params };
    },
  });
}

function invokeAgentTool() {
  return tool({
    description:
      'Invoke an existing agent by its slug to handle a task. ' +
      'The agent will execute independently and return its result.',
    parameters: z.object({
      agentSlug: z.string().describe('The slug of the agent to invoke'),
      version: z.union([z.number(), z.literal('latest')]).describe('Which published version to execute'),
      task: z.string().describe('The task for the agent to complete'),
      contextItems: z.array(z.string()).optional().describe('Additional context items'),
      model: z.string().optional().describe('Override the agent model'),
      outputSchema: z.record(z.unknown()).optional().describe('JSON Schema to validate the agent output'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'invoke_agent', params };
    },
  });
}

function invokeWorkflowTool() {
  return tool({
    description:
      'Invoke an existing workflow by its slug. ' +
      'Provide a user message that matches the workflow routing.',
    parameters: z.object({
      workflowSlug: z.string().describe('The slug of the workflow to invoke'),
      version: z.union([z.number(), z.literal('latest')]).describe('Which published version to execute'),
      user_said: z.string().describe('The user message for workflow routing'),
      contextItems: z.array(z.string()).optional().describe('Additional context items'),
      model: z.string().optional().describe('Override the workflow model'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'invoke_workflow', params };
    },
  });
}

export {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/tools/dispatchTools.ts
git commit -m "feat: add dispatch tool definitions (create_agent, invoke_agent, invoke_workflow)"
```

---

### Task 8: System tool injector

**Files:**
- Create: `packages/api/src/tools/systemToolInjector.ts`

- [ ] **Step 1: Create the injector**

Create `packages/api/src/tools/systemToolInjector.ts`:

```typescript
import type { Tool } from 'ai';

import { FINISH_TOOL_NAME, createFinishTool } from './finishTool.js';
import {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
} from './dispatchTools.js';

const SYSTEM_TOOL_PREFIX = '__system_';

/**
 * Checks if a tool name uses the reserved __system_ prefix.
 * MCP tools with this prefix should be rejected.
 */
export function hasSystemPrefix(toolName: string): boolean {
  return toolName.startsWith(SYSTEM_TOOL_PREFIX);
}

interface InjectSystemToolsParams {
  existingTools: Record<string, Tool>;
  isChildAgent: boolean;
}

/**
 * Injects system tools (dispatch + optionally finish) into a tool set.
 * Filters out any MCP tools that conflict with system tool names.
 */
export function injectSystemTools(params: InjectSystemToolsParams): Record<string, Tool> {
  const { existingTools, isChildAgent } = params;

  // Filter out conflicting MCP tools
  const filtered: Record<string, Tool> = {};
  for (const [name, t] of Object.entries(existingTools)) {
    if (hasSystemPrefix(name)) {
      process.stderr.write(
        `[systemTools] WARNING: Rejecting MCP tool "${name}" — reserved __system_ prefix\n`
      );
      continue;
    }
    filtered[name] = t;
  }

  // Add dispatch tools (always available)
  const systemTools: Record<string, Tool> = {
    ...filtered,
    [CREATE_AGENT_TOOL_NAME]: createAgentTool(),
    [INVOKE_AGENT_TOOL_NAME]: invokeAgentTool(),
    [INVOKE_WORKFLOW_TOOL_NAME]: invokeWorkflowTool(),
  };

  // Add finish tool (child agents only)
  if (isChildAgent) {
    systemTools[FINISH_TOOL_NAME] = createFinishTool();
  }

  return systemTools;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/tools/systemToolInjector.ts
git commit -m "feat: add system tool injector with conflict detection"
```

---

### Task 9: Extend AgentLoopResult for sentinel outcomes

**Files:**
- Modify: `packages/api/src/agentLoop/agentLoopTypes.ts`

- [ ] **Step 1: Add dispatch and finish result types**

In `packages/api/src/agentLoop/agentLoopTypes.ts`, add imports and extend `AgentLoopResult`:

Add at the top:
```typescript
import type { DispatchSentinel, FinishSentinel } from '@src/types/sentinels.js';
```

Update `AgentLoopResult` (line 53-59):

```typescript
export interface AgentLoopResult {
  finalText: string;
  steps: number;
  totalTokens: TokenLog;
  tokensLogs: ActionTokenUsage[];
  toolCalls: AgentToolCallRecord[];
  finishResult?: FinishSentinel;
  dispatchResult?: DispatchSentinel;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w packages/api
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop/agentLoopTypes.ts
git commit -m "feat: extend AgentLoopResult with finishResult and dispatchResult"
```

---

### Task 10: Agent loop sentinel detection and maxSteps auto-finish

**Files:**
- Modify: `packages/api/src/agentLoop/agentLoop.ts`

- [ ] **Step 1: Add sentinel detection imports**

Add at the top of `packages/api/src/agentLoop/agentLoop.ts`:

```typescript
import { detectSentinels } from '@src/core/sentinelDetector.js';
```

- [ ] **Step 2: Update runLoopStep to detect sentinels**

Replace the `runLoopStep` function (line 147-161):

```typescript
async function runLoopStep(
  config: AgentLoopConfig,
  state: LoopState,
  callbacks: AgentLoopCallbacks,
  isChildAgent: boolean
): Promise<AgentLoopResult | null> {
  const stepResult = await executeStep(config, state, callbacks);
  advanceStep(state);

  // Check for sentinels in tool call results
  const sentinel = detectSentinels(stepResult.toolCalls);
  if (sentinel.type === 'finish') {
    const result = buildResult(state, stepResult.text);
    result.finishResult = sentinel.finishSentinel;
    return result;
  }
  if (sentinel.type === 'dispatch') {
    appendResponseMessages(state, stepResult, callbacks, state.step);
    const result = buildResult(state, stepResult.text);
    result.dispatchResult = sentinel.dispatchSentinel;
    return result;
  }

  if (stepResult.done) {
    return buildResult(state, stepResult.text);
  }

  appendResponseMessages(state, stepResult, callbacks, state.step);
  return null;
}
```

- [ ] **Step 3: Update runLoop for maxSteps auto-finish**

Replace the `runLoop` function (line 163-177):

```typescript
async function runLoop(
  config: AgentLoopConfig,
  state: LoopState,
  maxSteps: number,
  callbacks: AgentLoopCallbacks,
  isChildAgent: boolean
): Promise<AgentLoopResult> {
  if (state.step >= maxSteps) {
    const result = buildResult(state, '');
    if (isChildAgent) {
      result.finishResult = {
        __sentinel: 'finish',
        output: 'Agent reached maximum step limit without completing the task.',
        status: 'error',
      };
    }
    return result;
  }

  const stepResult = await runLoopStep(config, state, callbacks, isChildAgent);
  if (stepResult !== null) return stepResult;

  return await runLoop(config, state, maxSteps, callbacks, isChildAgent);
}
```

- [ ] **Step 4: Update executeAgentLoop signature**

Update `executeAgentLoop` (line 185-208) to accept `isChildAgent`:

```typescript
export async function executeAgentLoop(
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks,
  isChildAgent: boolean = false
): Promise<AgentLoopResult> {
  const resolved = mergeSkillTools(config);
  const maxSteps = resolveMaxSteps(resolved);
  log('starting', {
    systemPrompt: resolved.systemPrompt.slice(ZERO, PROMPT_PREVIEW_LENGTH),
    context: resolved.context.slice(ZERO, PROMPT_PREVIEW_LENGTH),
    maxSteps,
    modelId: resolved.modelId,
    messageCount: resolved.messages.length,
    toolCount: Object.keys(resolved.tools).length,
    skillCount: resolved.skills?.length ?? ZERO,
    isChildAgent,
  });
  const state = createInitialState(resolved);
  const result = await runLoop(resolved, state, maxSteps, callbacks, isChildAgent);
  log('finished', {
    finalText: result.finalText.slice(ZERO, TEXT_PREVIEW_LENGTH),
    totalSteps: result.steps,
    tokens: result.totalTokens,
    hasFinish: result.finishResult !== undefined,
    hasDispatch: result.dispatchResult !== undefined,
  });
  return result;
}
```

Update `executeAgentLoopSimple` accordingly:

```typescript
export async function executeAgentLoopSimple(
  config: AgentLoopConfig,
  isChildAgent: boolean = false
): Promise<AgentLoopResult> {
  return await executeAgentLoop(config, { onStepProcessed: noopStepProcessed }, isChildAgent);
}
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck -w packages/api && npm run test -w packages/api
```

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/agentLoop/agentLoop.ts
git commit -m "feat: add sentinel detection and maxSteps auto-finish to agent loop"
```

---

### Task 11: Stack queries (push, pop, getTop)

**Files:**
- Create: `packages/backend/src/db/queries/stackQueries.ts`

- [ ] **Step 1: Create stack query functions**

Create `packages/backend/src/db/queries/stackQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

export interface StackEntry {
  id: string;
  sessionId: string;
  depth: number;
  executionId: string;
  parentExecutionId: string | null;
  parentToolOutputMessageId: string | null;
  parentSessionState: Record<string, unknown> | null;
  agentConfig: Record<string, unknown>;
  appType: 'agent' | 'workflow';
  dispatchedAt: string;
}

export async function getStackTop(
  supabase: SupabaseClient,
  sessionId: string
): Promise<StackEntry | null> {
  const { data, error } = await supabase
    .from('agent_stack_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('depth', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) throw new Error(`Failed to get stack top: ${error.message}`);
  return data as StackEntry | null;
}

export async function getStackDepth(
  supabase: SupabaseClient,
  sessionId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('agent_stack_entries')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error !== null) throw new Error(`Failed to get stack depth: ${error.message}`);
  return count ?? 0;
}

export interface PushStackEntryParams {
  sessionId: string;
  depth: number;
  executionId: string;
  parentExecutionId: string;
  parentToolOutputMessageId: string;
  parentSessionState: Record<string, unknown>;
  agentConfig: Record<string, unknown>;
  appType: 'agent' | 'workflow';
}

export async function pushStackEntry(
  supabase: SupabaseClient,
  params: PushStackEntryParams
): Promise<void> {
  const { error } = await supabase.from('agent_stack_entries').insert({
    session_id: params.sessionId,
    depth: params.depth,
    execution_id: params.executionId,
    parent_execution_id: params.parentExecutionId,
    parent_tool_output_message_id: params.parentToolOutputMessageId,
    parent_session_state: params.parentSessionState,
    agent_config: params.agentConfig,
    app_type: params.appType,
  });

  if (error !== null) throw new Error(`Failed to push stack entry: ${error.message}`);
}

export async function popStackEntry(
  supabase: SupabaseClient,
  sessionId: string
): Promise<StackEntry | null> {
  const top = await getStackTop(supabase, sessionId);
  if (top === null) return null;

  const { error } = await supabase
    .from('agent_stack_entries')
    .delete()
    .eq('id', top.id);

  if (error !== null) throw new Error(`Failed to pop stack entry: ${error.message}`);
  return top;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/db/queries/stackQueries.ts
git commit -m "feat: add agent stack CRUD queries (push, pop, getTop)"
```

---

### Task 12: Resume queries

**Files:**
- Create: `packages/backend/src/db/queries/resumeQueries.ts`

- [ ] **Step 1: Create resume query functions**

Create `packages/backend/src/db/queries/resumeQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

export interface PendingResume {
  id: string;
  sessionId: string;
  parentExecutionId: string;
  parentToolOutputMessageId: string;
  childOutput: string;
  childStatus: 'success' | 'error';
  parentSessionState: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

export async function createPendingResume(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    parentExecutionId: string;
    parentToolOutputMessageId: string;
    childOutput: string;
    childStatus: 'success' | 'error';
    parentSessionState: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from('pending_resumes').upsert(
    {
      session_id: params.sessionId,
      parent_execution_id: params.parentExecutionId,
      parent_tool_output_message_id: params.parentToolOutputMessageId,
      child_output: params.childOutput,
      child_status: params.childStatus,
      parent_session_state: params.parentSessionState,
      status: 'pending',
    },
    { onConflict: 'parent_execution_id' }
  );

  if (error !== null) throw new Error(`Failed to create pending resume: ${error.message}`);
}

export async function markResumeCompleted(
  supabase: SupabaseClient,
  parentExecutionId: string
): Promise<void> {
  const { error } = await supabase
    .from('pending_resumes')
    .update({ status: 'completed' })
    .eq('parent_execution_id', parentExecutionId);

  if (error !== null) throw new Error(`Failed to mark resume completed: ${error.message}`);
}

export async function claimPendingResumes(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingResume[]> {
  const { data, error } = await supabase.rpc('claim_pending_resumes', { batch_limit: limit });
  if (error !== null) throw new Error(`Failed to claim pending resumes: ${error.message}`);
  return (data ?? []) as PendingResume[];
}

export async function markResumeFailed(
  supabase: SupabaseClient,
  resumeId: string
): Promise<void> {
  const { error } = await supabase
    .from('pending_resumes')
    .update({ status: 'failed' })
    .eq('id', resumeId);

  if (error !== null) throw new Error(`Failed to mark resume failed: ${error.message}`);
}

export async function incrementResumeAttempt(
  supabase: SupabaseClient,
  resumeId: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_resume_attempt', { resume_id: resumeId });
  if (error !== null) throw new Error(`Failed to increment resume attempt: ${error.message}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/db/queries/resumeQueries.ts
git commit -m "feat: add pending resume query functions"
```

---

### Task 13: Event persistence queries

**Files:**
- Create: `packages/backend/src/db/queries/eventQueries.ts`

- [ ] **Step 1: Create event query functions**

Create `packages/backend/src/db/queries/eventQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

export interface ExecutionEvent {
  executionId: string;
  orgId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
}

export async function persistEvent(
  supabase: SupabaseClient,
  event: ExecutionEvent
): Promise<void> {
  const { error } = await supabase.from('agent_execution_events').insert({
    execution_id: event.executionId,
    org_id: event.orgId,
    sequence: event.sequence,
    event_type: event.eventType,
    payload: event.payload,
  });

  if (error !== null) {
    process.stderr.write(`[events] Failed to persist event: ${error.message}\n`);
  }
}

export async function getEventsAfter(
  supabase: SupabaseClient,
  executionId: string,
  afterSequence: number
): Promise<ExecutionEvent[]> {
  const { data, error } = await supabase
    .from('agent_execution_events')
    .select('*')
    .eq('execution_id', executionId)
    .gt('sequence', afterSequence)
    .order('sequence', { ascending: true });

  if (error !== null) throw new Error(`Failed to get events: ${error.message}`);
  return (data ?? []) as ExecutionEvent[];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/db/queries/eventQueries.ts
git commit -m "feat: add execution event persistence queries"
```

---

### Task 14: Internal auth middleware

**Files:**
- Create: `packages/backend/src/routes/internal/internalAuth.ts`

- [ ] **Step 1: Create service-key auth middleware**

Create `packages/backend/src/routes/internal/internalAuth.ts`:

```typescript
import type { NextFunction, Request, Response } from 'express';

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);
  if (token !== INTERNAL_SERVICE_KEY || INTERNAL_SERVICE_KEY === '') {
    res.status(401).json({ error: 'Invalid service key' });
    return;
  }

  next();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/routes/internal/internalAuth.ts
git commit -m "feat: add internal service-key auth middleware"
```

---

### Task 15: Internal router + execute-child endpoint

**Files:**
- Create: `packages/backend/src/routes/internal/internalRouter.ts`
- Create: `packages/backend/src/routes/internal/executeChildHandler.ts`

- [ ] **Step 1: Create execute-child handler**

Create `packages/backend/src/routes/internal/executeChildHandler.ts`:

```typescript
import type { Request, Response } from 'express';

/**
 * POST /internal/execute-child
 *
 * Starts a child agent/workflow execution on a new serverless instance.
 * Idempotent: checks if the execution already exists before starting.
 *
 * Returns 2xx immediately upon accepting the work (before executing).
 * The actual execution happens asynchronously after the response.
 */
export async function handleExecuteChild(req: Request, res: Response): Promise<void> {
  // TODO: Implement child execution startup
  // 1. Extract executionId, agentConfig, initialMessage, orgId, apiKeyId from body
  // 2. Check if execution already exists (idempotency)
  // 3. Accept the work immediately (return 202)
  // 4. Execute asynchronously (after response)
  res.status(202).json({ accepted: true });
}
```

- [ ] **Step 2: Create internal router**

Create `packages/backend/src/routes/internal/internalRouter.ts`:

```typescript
import { Router } from 'express';

import { requireInternalAuth } from './internalAuth.js';
import { handleExecuteChild } from './executeChildHandler.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);
internalRouter.post('/execute-child', handleExecuteChild);
```

- [ ] **Step 3: Register internal router in server.ts**

In `packages/backend/src/server.ts`, add:

```typescript
import { internalRouter } from './routes/internal/internalRouter.js';
```

And register the router (after the existing route registrations):

```typescript
app.use('/internal', internalRouter);
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/internal/
git add packages/backend/src/server.ts
git commit -m "feat: add internal execute-child endpoint with service auth"
```

---

### Task 16: Resume-parent endpoint

**Files:**
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`
- Create: `packages/backend/src/routes/internal/resumeParentHandler.ts`

- [ ] **Step 1: Create resume-parent handler**

Create `packages/backend/src/routes/internal/resumeParentHandler.ts`:

```typescript
import type { Request, Response } from 'express';

/**
 * POST /internal/resume-parent
 *
 * Resumes a parent agent execution after a child completes.
 * Idempotent: checks if the parent is already resumed before processing.
 *
 * 1. Updates the parent's tool output message with child's output
 * 2. Restores parent's session state
 * 3. Pops the stack entry
 * 4. Resumes the parent's agent loop
 */
export async function handleResumeParent(req: Request, res: Response): Promise<void> {
  // TODO: Implement parent resumption
  // 1. Extract parentExecutionId, childOutput, childStatus, parentSessionState from body
  // 2. Check if parent is already resumed (idempotency)
  // 3. Update tool output message
  // 4. Restore session state
  // 5. Pop stack entry
  // 6. Resume parent execution
  res.status(200).json({ resumed: true });
}
```

- [ ] **Step 2: Register in internal router**

In `packages/backend/src/routes/internal/internalRouter.ts`, add:

```typescript
import { handleResumeParent } from './resumeParentHandler.js';
```

And register:

```typescript
internalRouter.post('/resume-parent', handleResumeParent);
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/internal/
git commit -m "feat: add internal resume-parent endpoint"
```

---

### Task 17: Resume worker

**Files:**
- Create: `packages/backend/src/workers/resumeWorker.ts`

- [ ] **Step 1: Create the resume worker**

Create `packages/backend/src/workers/resumeWorker.ts`:

```typescript
const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 10;

/**
 * Background worker that processes pending resumes.
 * Runs on a fixed interval, claims pending resumes, and attempts
 * to resume parent executions via POST /internal/resume-parent.
 */
export function startResumeWorker(): void {
  process.stderr.write('[resumeWorker] Starting resume worker\n');

  setInterval(async () => {
    try {
      await processPendingResumes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[resumeWorker] Error: ${msg}\n`);
    }
  }, POLL_INTERVAL_MS);
}

async function processPendingResumes(): Promise<void> {
  // TODO: Implement resume processing
  // 1. Claim BATCH_SIZE pending resumes (FOR UPDATE SKIP LOCKED)
  // 2. For each: POST to /internal/resume-parent
  // 3. On success: mark as completed
  // 4. On failure: increment attempts, set back to pending
  // 5. If attempts >= MAX_ATTEMPTS: mark as failed
}

export { MAX_ATTEMPTS, BATCH_SIZE };
```

- [ ] **Step 2: Start worker in server.ts**

In `packages/backend/src/server.ts`, add:

```typescript
import { startResumeWorker } from './workers/resumeWorker.js';
```

And start it after the server begins listening:

```typescript
startResumeWorker();
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/workers/resumeWorker.ts
git add packages/backend/src/server.ts
git commit -m "feat: add resume worker for processing pending resumes"
```

---

### Task 18: Update execution queries for composition

**Files:**
- Modify: `packages/backend/src/db/queries/executionQueries.ts`

- [ ] **Step 1: Add parent_execution_id to createExecution**

In `packages/backend/src/db/queries/executionQueries.ts`, find the `createExecution` function and add `parentExecutionId` and `isDynamicChild` to the insert:

Add to the function parameters:
```typescript
parentExecutionId?: string;
isDynamicChild?: boolean;
```

Add to the insert object:
```typescript
parent_execution_id: params.parentExecutionId ?? null,
is_dynamic_child: params.isDynamicChild ?? false,
```

- [ ] **Step 2: Add execution-scoped message retrieval**

Add a new function after `getSessionMessages`:

```typescript
export async function getExecutionMessages(
  supabase: SupabaseClient,
  executionId: string
): Promise<Array<{ role: string; content: unknown }>> {
  const { data, error } = await supabase
    .from('agent_execution_messages')
    .select('role, content, tool_calls, tool_call_id')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (error !== null) throw new Error(`Failed to get execution messages: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 3: Add function to update tool output message**

```typescript
export async function updateToolOutputMessage(
  supabase: SupabaseClient,
  messageId: string,
  newContent: unknown
): Promise<void> {
  const { error } = await supabase
    .from('agent_execution_messages')
    .update({ content: newContent })
    .eq('id', messageId);

  if (error !== null) throw new Error(`Failed to update tool output message: ${error.message}`);
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/executionQueries.ts
git commit -m "feat: add composition support to execution queries"
```

---

### Task 19: Update client-side SSE for new event types

**Files:**
- Modify: `packages/web/app/lib/api.ts`

- [ ] **Step 1: Add new event types to SseEventSchema**

In `packages/web/app/lib/api.ts`, find the `SseEventSchema` and add the new event types:

Add `child_dispatched` and `child_completed` to the discriminated union.

- [ ] **Step 2: Add handlers in dispatchSseEvent**

In the `dispatchSseEvent` function, add handlers for the new events:

```typescript
case 'child_dispatched':
  callbacks.onChildDispatched?.(event);
  break;
case 'child_completed':
  callbacks.onChildCompleted?.(event);
  break;
```

- [ ] **Step 3: Extend StreamCallbacks interface**

Add to `StreamCallbacks`:

```typescript
onChildDispatched?: (event: { childExecutionId: string; childAppType: string }) => void;
onChildCompleted?: (event: { parentExecutionId: string; output: string; status: string }) => void;
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/api.ts
git commit -m "feat: add child_dispatched and child_completed SSE event handlers"
```

---

### Task 20: Execution breadcrumb component

**Files:**
- Create: `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx`

- [ ] **Step 1: Create breadcrumb component**

Create `packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx`:

```tsx
'use client';

import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  executionId: string;
  label: string;
}

interface ExecutionBreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (executionId: string) => void;
}

export function ExecutionBreadcrumb({ items, onNavigate }: ExecutionBreadcrumbProps) {
  if (items.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1.5">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.executionId} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" />}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.executionId)}
                className="hover:text-foreground transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/dashboard/ExecutionBreadcrumb.tsx
git commit -m "feat: add execution breadcrumb component for nested executions"
```

---

### Task 21: Run full check

- [ ] **Step 1: Run all checks**

```bash
npm run check
```

- [ ] **Step 2: Run API tests**

```bash
npm run test -w packages/api
```

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve check issues in agent composition implementation"
```
