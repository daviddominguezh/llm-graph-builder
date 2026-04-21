# Execution API Composition Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing but disconnected composition infrastructure so agents can dispatch children via the production execution API using an event-driven serverless model.

**Architecture:** When the edge function returns a `dispatchResult`, the backend creates a durable `pending_child_execution` row. A background worker picks it up, invokes the child on a new edge function instance. When the child finishes, a `pending_resume` row is created. The resume handler updates the parent's tool result message, pops the stack, and continues the parent via `executeAgentCore` with `continueExecutionId` (same execution record). All operations are atomic (CTE with FOR UPDATE SKIP LOCKED) to prevent double-processing under concurrency.

**Tech Stack:** TypeScript, Express, Supabase (PostgreSQL), AI SDK

**Spec:** `docs/superpowers/specs/2026-04-09-execution-api-composition-wiring.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/YYYYMMDD_pending_child_executions.sql` | New table for durable child dispatch |
| `packages/backend/src/routes/execute/executeDispatchHandler.ts` | Handle dispatch: resolve child, push stack, write pending child execution |
| `packages/backend/src/workers/childExecutionWorker.ts` | Poll pending_child_executions, invoke child edge functions |
| `packages/backend/src/db/queries/childExecutionQueries.ts` | CRUD for pending_child_executions table |

### Modified files

| File | Changes |
|------|---------|
| `packages/api/src/core/types.ts` | Add `dispatchResult?` and `finishResult?` to `CallAgentOutput` |
| `packages/backend/src/routes/execute/edgeFunctionAgentEvents.ts` | Extract dispatch/finish from SSE event |
| `packages/backend/src/routes/execute/edgeFunctionClient.ts` | Pass dispatch/finish through result |
| `packages/backend/src/routes/execute/executeCore.ts` | Check for `dispatchResult` after edge call; add `continueExecutionId` path |
| `packages/backend/src/routes/execute/executeFetcher.ts` | Use execution-scoped messages instead of session-scoped |
| `packages/backend/src/db/queries/executionQueries.ts` | Unify `getExecutionMessages` return type; add `saveExecutionMessageRaw` |
| `packages/backend/src/db/queries/stackQueries.ts` | Make `popStackEntry` atomic CTE |
| `packages/backend/src/db/queries/resumeQueries.ts` | Add atomic claim function; add FOR UPDATE SKIP LOCKED |
| `packages/backend/src/routes/internal/resumeParentHandler.ts` | Atomic claim, fix tool result format, re-invoke parent |
| `packages/backend/src/workers/resumeWorker.ts` | Use atomic claim |
| `packages/backend/src/index.ts` | Register childExecutionWorker |

### Removed files

| File | Reason |
|------|--------|
| `packages/backend/src/routes/internal/executeChildHandler.ts` | Replaced by childExecutionWorker |

---

### Task 1: Database migration — pending_child_executions table

**Files:**
- Create: `supabase/migrations/20260409100000_pending_child_executions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Durable child execution dispatch table
CREATE TABLE pending_child_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_execution_id uuid NOT NULL REFERENCES agent_executions(id),
  agent_config jsonb NOT NULL,
  org_id uuid NOT NULL,
  api_key_enc text NOT NULL,
  app_type text NOT NULL CHECK (app_type IN ('agent', 'workflow')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(execution_id)
);

CREATE INDEX idx_pending_child_executions_status
  ON pending_child_executions(status) WHERE status = 'pending';

ALTER TABLE pending_child_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_child_executions" ON pending_child_executions
  FOR ALL USING (true) WITH CHECK (true);

-- Add 'suspended' status to agent_executions
ALTER TABLE agent_executions
  DROP CONSTRAINT IF EXISTS agent_executions_status_check;

ALTER TABLE agent_executions
  ADD CONSTRAINT agent_executions_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'suspended'));
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409100000_pending_child_executions.sql
git commit -m "feat: add pending_child_executions table and suspended execution status"
```

---

### Task 2: Atomic stack operations

**Files:**
- Modify: `packages/backend/src/db/queries/stackQueries.ts`

- [ ] **Step 1: Make popStackEntry atomic**

Replace the current two-step SELECT+DELETE `popStackEntry` with an atomic RPC call. Since Supabase JS client doesn't support CTEs directly, use `supabase.rpc()` with a Postgres function.

Add a new migration `supabase/migrations/20260409100001_atomic_stack_pop.sql`:

```sql
CREATE OR REPLACE FUNCTION pop_stack_entry(p_session_id uuid)
RETURNS SETOF agent_stack_entries
LANGUAGE sql
AS $$
  DELETE FROM agent_stack_entries
  WHERE id = (
    SELECT id FROM agent_stack_entries
    WHERE session_id = p_session_id
    ORDER BY depth DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
```

Update `popStackEntry` in `stackQueries.ts`:

```typescript
export async function popStackEntry(supabase: SupabaseClient, sessionId: string): Promise<StackEntry | null> {
  const result = await supabase.rpc('pop_stack_entry', { p_session_id: sessionId });
  if (result.error !== null) throw new Error(`Failed to pop stack entry: ${result.error.message}`);
  const rows = result.data as StackEntry[] | null;
  if (rows === null || rows.length === ZERO) return null;
  return rows[ZERO] ?? null;
}
```

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409100001_atomic_stack_pop.sql packages/backend/src/db/queries/stackQueries.ts
git commit -m "feat: make popStackEntry atomic with FOR UPDATE SKIP LOCKED"
```

---

### Task 3: Atomic resume claim and child execution queries

**Files:**
- Modify: `packages/backend/src/db/queries/resumeQueries.ts`
- Create: `packages/backend/src/db/queries/childExecutionQueries.ts`

- [ ] **Step 1: Add atomic claim to resumeQueries**

Add to `resumeQueries.ts`:

```typescript
export async function claimPendingResume(
  supabase: SupabaseClient,
  parentExecutionId: string
): Promise<PendingResume | null> {
  const result: QueryResult<PendingResume[]> = await supabase
    .from('pending_resumes')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('parent_execution_id', parentExecutionId)
    .eq('status', 'pending')
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim pending resume: ${result.error.message}`);
  const rows = result.data ?? [];
  return rows.length > ZERO ? (rows[ZERO] ?? null) : null;
}
```

Update `fetchPendingResumes` to use atomic claim pattern (UPDATE RETURNING instead of SELECT):

```typescript
export async function fetchAndClaimPendingResumes(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingResume[]> {
  const result: QueryResult<PendingResume[]> = await supabase
    .from('pending_resumes')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim pending resumes: ${result.error.message}`);
  return result.data ?? [];
}
```

- [ ] **Step 2: Create childExecutionQueries**

Create `packages/backend/src/db/queries/childExecutionQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

const ZERO = 0;

export interface PendingChildExecution {
  id: string;
  session_id: string;
  execution_id: string;
  parent_execution_id: string;
  agent_config: Record<string, unknown>;
  org_id: string;
  api_key_enc: string;
  app_type: 'agent' | 'workflow';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function createPendingChildExecution(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    executionId: string;
    parentExecutionId: string;
    agentConfig: Record<string, unknown>;
    orgId: string;
    apiKeyEnc: string;
    appType: 'agent' | 'workflow';
  }
): Promise<void> {
  const { error } = await supabase.from('pending_child_executions').insert({
    session_id: params.sessionId,
    execution_id: params.executionId,
    parent_execution_id: params.parentExecutionId,
    agent_config: params.agentConfig,
    org_id: params.orgId,
    api_key_enc: params.apiKeyEnc,
    app_type: params.appType,
  });
  if (error !== null) throw new Error(`Failed to create pending child execution: ${error.message}`);
}

export async function fetchAndClaimChildExecutions(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingChildExecution[]> {
  const result: QueryResult<PendingChildExecution[]> = await supabase
    .from('pending_child_executions')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim child executions: ${result.error.message}`);
  return result.data ?? [];
}

export async function updateChildExecutionStatus(
  supabase: SupabaseClient,
  id: string,
  status: 'completed' | 'failed' | 'pending'
): Promise<void> {
  const { error } = await supabase
    .from('pending_child_executions')
    .update({ status, last_attempt_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) throw new Error(`Failed to update child execution status: ${error.message}`);
}

export async function incrementChildExecutionAttempts(
  supabase: SupabaseClient,
  id: string,
  currentAttempts: number
): Promise<void> {
  const INCREMENT = 1;
  const { error } = await supabase
    .from('pending_child_executions')
    .update({ attempts: currentAttempts + INCREMENT, last_attempt_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) throw new Error(`Failed to increment child execution attempts: ${error.message}`);
}
```

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/queries/resumeQueries.ts packages/backend/src/db/queries/childExecutionQueries.ts
git commit -m "feat: add atomic resume claim and child execution queries"
```

---

### Task 4: Unify message queries and add raw message save

**Files:**
- Modify: `packages/backend/src/db/queries/executionQueries.ts`

- [ ] **Step 1: Unify getExecutionMessages to return MessageRow[]**

Update `getExecutionMessages` to SELECT the same columns as `getSessionMessages` so both return `MessageRow[]`:

```typescript
export async function getExecutionMessages(
  supabase: SupabaseClient,
  executionId: string
): Promise<MessageRow[]> {
  const result: QueryResult<MessageRow[]> = await supabase
    .from('agent_execution_messages')
    .select('*')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (result.error !== null) throw new Error(`Failed to get execution messages: ${result.error.message}`);
  return result.data ?? [];
}
```

- [ ] **Step 2: Add saveExecutionMessageRaw for structured content**

The existing `saveExecutionMessage` wraps content in `{ text: ... }`. We need a version that saves raw content (for tool result messages with AI SDK format):

```typescript
interface SaveRawMessageParams {
  sessionId: string;
  executionId: string;
  nodeId: string;
  role: string;
  content: Record<string, unknown>;
}

export async function saveExecutionMessageRaw(
  supabase: SupabaseClient,
  params: SaveRawMessageParams
): Promise<string> {
  const result: QueryResult<{ id: string }> = await supabase
    .from('agent_execution_messages')
    .insert({
      session_id: params.sessionId,
      execution_id: params.executionId,
      node_id: params.nodeId,
      role: params.role,
      content: params.content,
    })
    .select('id')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`saveExecutionMessageRaw: ${result.error?.message ?? 'No data'}`);
  }
  return result.data.id;
}
```

Export `MessageRow` type so other modules can use it.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/queries/executionQueries.ts
git commit -m "feat: unify getExecutionMessages return type, add saveExecutionMessageRaw"
```

---

### Task 5: Add dispatchResult/finishResult to CallAgentOutput

**Files:**
- Modify: `packages/api/src/core/types.ts`

- [ ] **Step 1: Add fields to CallAgentOutput**

Add imports and fields:

```typescript
import type { DispatchSentinel, FinishSentinel } from '@src/types/sentinels.js';
```

Add to `CallAgentOutput` interface:

```typescript
  dispatchResult?: DispatchSentinel;
  finishResult?: FinishSentinel;
```

- [ ] **Step 2: Verify and rebuild**

Run: `npm run check -w packages/api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/core/types.ts
git commit -m "feat: add dispatchResult and finishResult to CallAgentOutput"
```

---

### Task 6: Extract dispatch/finish from edge function SSE events

**Files:**
- Modify: `packages/backend/src/routes/execute/edgeFunctionAgentEvents.ts`
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`

- [ ] **Step 1: Update buildAgentLoopResult to extract dispatch/finish**

In `edgeFunctionAgentEvents.ts`, update `buildAgentLoopResult`:

```typescript
export function buildAgentLoopResult(event: SseEvent, nodeTexts: NodeProcessedData[]): CallAgentOutput {
  const tokensLogs = buildTokensLogsFromEvent(event);
  return {
    message: null,
    text: toStr(event.text),
    visitedNodes: nodeTexts.map((nt) => nt.nodeId),
    toolCalls: isToolCallsArray(event.toolCalls) ? event.toolCalls : [],
    tokensLogs,
    debugMessages: {},
    structuredOutputs: [],
    parsedResults: nodeTexts.map((nt) => ({
      nextNodeID: '',
      messageToUser: nt.text === '' ? undefined : nt.text,
    })),
    dispatchResult: isDispatchSentinel(event.dispatchResult) ? event.dispatchResult : undefined,
    finishResult: isFinishSentinel(event.finishResult) ? event.finishResult : undefined,
  };
}
```

Add imports at top:

```typescript
import { type DispatchSentinel, type FinishSentinel, isDispatchSentinel, isFinishSentinel } from '@daviddh/llm-graph-runner';
```

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/execute/edgeFunctionAgentEvents.ts
git commit -m "feat: extract dispatchResult and finishResult from edge function SSE events"
```

---

### Task 7: Message isolation — execution-scoped message loading

**Files:**
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts`

- [ ] **Step 1: Use getExecutionMessages when loading for a specific execution**

In `fetchSessionData`, after getting the session and stack top, change message loading. Currently it always uses `getSessionMessages`. For the initial version, keep using `getSessionMessages` for the root (backward compatible) since all existing messages are scoped to the session. For children (when `stackTop !== null`), the child's messages will be loaded by execution_id in the dispatch handler.

The key change: export `messageRowToMessage` so the dispatch handler can use it.

Also, add a new function for loading execution-scoped messages:

```typescript
export async function fetchExecutionMessages(
  supabase: SupabaseClient,
  executionId: string,
  channel: string
): Promise<Message[]> {
  const rows = await getExecutionMessages(supabase, executionId);
  const provider = resolveChannelProvider(channel);
  return rows.map((row) => messageRowToMessage(row, provider));
}
```

Import `getExecutionMessages` from `executionQueries.js`.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/execute/executeFetcher.ts
git commit -m "feat: add execution-scoped message loading for child isolation"
```

---

### Task 8: Dispatch handler

**Files:**
- Create: `packages/backend/src/routes/execute/executeDispatchHandler.ts`

- [ ] **Step 1: Create the dispatch handler**

This is the core new file. When `executeAgentCore` detects a `dispatchResult`, it calls this handler.

Key function:

```typescript
export async function handleDispatchResult(params: {
  supabase: SupabaseClient;
  sessionId: string;
  parentExecutionId: string;
  dispatchResult: DispatchSentinel;
  parentSessionState: { currentNodeId: string; structuredOutputs: Record<string, unknown[]> };
  orgId: string;
  agentId: string;
  version: number;
  apiKey: string;
  channel: string;
  tenantId: string;
  userId: string;
  parentToolCalls: Array<{ toolName: string; toolCallId?: string; input?: unknown }>;
}): Promise<void>
```

Logic (extract into helper functions to stay under 40 lines each):

1. `checkDepthAndResolve`: Check stack depth, resolve child config via `resolveChildConfig`
2. `createChildExecution`: Create child execution record with `parent_execution_id` set
3. `writeChildTask`: Write child's task as first user message (execution_id = child's)
4. `createPlaceholderToolResult`: Find `toolCallId` and `toolName` from parent's tool calls, create placeholder message with sentinel content
5. `pushStackAndWriteIntent`: Push stack entry, write pending_child_execution, update parent status to 'suspended'

Use `resolveChildConfig` from `../simulateChildResolver.js` (reuse the same resolver — it already handles all dispatch types and org-scoped queries).

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/execute/executeDispatchHandler.ts
git commit -m "feat: add executeDispatchHandler for wiring dispatch result to child execution"
```

---

### Task 9: Wire dispatch detection in executeCore

**Files:**
- Modify: `packages/backend/src/routes/execute/executeCore.ts`

- [ ] **Step 1: Add dispatch detection after edge function call**

After `persistCoreResult` (line 139), add:

```typescript
if (output?.dispatchResult !== undefined) {
  await handleDispatchResult({
    supabase,
    sessionId: fetched.sessionDbId,
    parentExecutionId: executionId,
    dispatchResult: output.dispatchResult,
    parentSessionState: {
      currentNodeId: fetched.currentNodeId,
      structuredOutputs: fetched.structuredOutputs,
    },
    orgId: params.orgId,
    agentId: params.agentId,
    version: params.version,
    apiKey: input.apiKey ?? '',
    channel: input.channel,
    tenantId: input.tenantId,
    userId: input.userId,
    parentToolCalls: output.toolCalls ?? [],
  });
}
```

Import `handleDispatchResult` from `./executeDispatchHandler.js`.

- [ ] **Step 2: Add continueExecutionId path**

Add optional `continueExecutionId` to `ExecuteCoreInput`:

```typescript
export interface ExecuteCoreInput {
  // ... existing fields ...
  continueExecutionId?: string;
}
```

In `setupExecution`, when `continueExecutionId` is set:
- Skip `persistPreExecution` (don't create new execution record)
- Use the existing execution ID
- Load messages from `getExecutionMessages(continueExecutionId)` instead of session-wide

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/execute/executeCore.ts
git commit -m "feat: wire dispatch detection and continueExecutionId in executeCore"
```

---

### Task 10: Fix resume handler — atomic claim, format, re-invoke

**Files:**
- Modify: `packages/backend/src/routes/internal/resumeParentHandler.ts`

- [ ] **Step 1: Rewrite resume handler**

The handler needs three major changes:
1. Atomic claim via `claimPendingResume` (abort if null)
2. Tool result in AI SDK format (not flat `{ text }`)
3. Re-invoke parent via `executeAgentCore` with `continueExecutionId`

Replace `restoreParentState` with a new flow:

```typescript
1. claimPendingResume(supabase, data.parentExecutionId) → if null, return 409
2. Build AI SDK tool result content from parentSessionState.toolCallId, toolName, childOutput
3. updateToolOutputMessage(supabase, data.parentToolOutputMessageId, aiSdkContent)
4. Restore session state (currentNodeId, structuredOutputs)
5. popStackEntry(supabase, data.sessionId) → if null, return 409 (already popped)
6. markResumeCompleted(supabase, data.parentExecutionId)
7. Call executeAgentCore with continueExecutionId: data.parentExecutionId
```

Import `claimPendingResume` from `resumeQueries.js`, `executeAgentCore` from `../execute/executeCore.js`.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/internal/resumeParentHandler.ts
git commit -m "feat: resume handler with atomic claim, AI SDK tool result format, parent re-invocation"
```

---

### Task 11: Child execution worker

**Files:**
- Create: `packages/backend/src/workers/childExecutionWorker.ts`

- [ ] **Step 1: Create the worker**

Follow the same pattern as `resumeWorker.ts`. The worker:
1. Polls `pending_child_executions` every 5s, batch of 10
2. For each: atomically claims via `fetchAndClaimChildExecutions`
3. Calls `executeAgentCore` for the child
4. When child finishes with `finishResult`: creates `pending_resume`, POSTs `/internal/resume-parent`
5. When child finishes without `finishResult`: child completed normally (no sub-dispatch)
6. On error: creates `pending_resume` with `childStatus: 'error'`
7. Max 10 attempts per child, then mark 'failed'

```typescript
export function startChildExecutionWorker(): void {
  log('Starting child execution worker');
  setInterval(() => {
    processPendingChildExecutions().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error: ${msg}`);
    });
  }, POLL_INTERVAL_MS);
}
```

- [ ] **Step 2: Register worker in index.ts**

In `packages/backend/src/index.ts`, import and call `startChildExecutionWorker()` alongside `startResumeWorker()`.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/workers/childExecutionWorker.ts packages/backend/src/index.ts
git commit -m "feat: add childExecutionWorker for durable child dispatch"
```

---

### Task 12: Update resume worker to use atomic claims

**Files:**
- Modify: `packages/backend/src/workers/resumeWorker.ts`

- [ ] **Step 1: Replace fetchPendingResumes with fetchAndClaimPendingResumes**

Update the `processPendingResumes` function to use `fetchAndClaimPendingResumes` instead of `fetchPendingResumes`. Remove the separate `updateResumeStatus` call after successful resume (the handler already marks it completed via `markResumeCompleted`).

On failure: call `updateResumeStatus(supabase, resume.id, 'pending')` to release the claim for retry (reset from 'processing' back to 'pending'), and increment attempts.

- [ ] **Step 2: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/workers/resumeWorker.ts
git commit -m "feat: resume worker uses atomic claim to prevent double-processing"
```

---

### Task 13: Remove executeChildHandler endpoint

**Files:**
- Delete: `packages/backend/src/routes/internal/executeChildHandler.ts`
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`

- [ ] **Step 1: Remove the route registration**

In `internalRouter.ts`, remove the `/execute-child` route and its import.

- [ ] **Step 2: Delete the handler file**

Delete `packages/backend/src/routes/internal/executeChildHandler.ts`.

- [ ] **Step 3: Verify**

Run: `npm run check -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/backend/src/routes/internal/
git commit -m "refactor: remove executeChildHandler, replaced by childExecutionWorker"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run all checks**

Run: `npm run check`
Expected: format + lint + typecheck all pass across all packages.

- [ ] **Step 2: Run all tests**

Run: `npm run test -w packages/api`
Run: `npm run test -w packages/backend`
Run: `npm run test -w packages/web -- --testPathPatterns=useCompositionStack`
Expected: All tests pass.

- [ ] **Step 3: Apply migrations**

Run: `npx supabase db push`

- [ ] **Step 4: Verify infrastructure is connected**

Check that all previously-disconnected functions are now called:
- `pushStackEntry` — called from `executeDispatchHandler.ts`
- `createPendingResume` — called from `childExecutionWorker.ts`
- `popStackEntry` (atomic) — called from `resumeParentHandler.ts`
- `claimPendingResume` — called from `resumeParentHandler.ts`
- `createPendingChildExecution` — called from `executeDispatchHandler.ts`
- `executeAgentCore` with `continueExecutionId` — called from `resumeParentHandler.ts`

Run: `grep -r "pushStackEntry\|createPendingResume\|popStackEntry\|claimPendingResume\|createPendingChildExecution\|continueExecutionId" packages/backend/src/ --include="*.ts" -l`
Expected: Each function appears in at least 2 files (definition + call site).
