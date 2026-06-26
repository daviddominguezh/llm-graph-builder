# RU4 — Cloudflare Worker + durable execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every production execution into a durable, resumable per-step machine — checkpointing each step the moment it completes, suspending for budget / input / dispatch, and resuming via a direct self-re-invoke (primary) backstopped by a staleness-gated Cloudflare Cron sweep — then host the RU3 runtime core in a new `packages/worker` Cloudflare Worker over Hyperdrive and flip `edgeFunctionClient` from the Supabase Deno edge to the Worker.

**Architecture:** Two phases in one plan. **4a (Node)** builds the durable mechanism on the RU3 core and exercises it entirely from the Node backend against Postgres: re-introduced `pending_resumes` table + `claim_pending_resumes` RPC, per-step checkpoint persistence (hooking `onStepProcessed`/`onToolExecuted` — tool result persisted *before* the position marker advances), `SupabaseDispatchPersistence` over `agent_stack_entries`, `DurableDispatchStrategy` (returns `{ kind: 'suspended' }`, sharing RU3's child-result injection), direct re-invoke triggers + idempotency keys, the portable cron-sweep function, active-leaf routing, and `maxDispatchDepth` collapsed to a single const defaulting to **3**. **4b (host)** scaffolds `packages/worker` (Hyperdrive `workerSupabase`, `wrangler.toml`), a `fetch` handler (new run / human resume / direct re-invoke) running `executeTurn` with durable caps, a `scheduled()` cron-backstop handler, the folded-in `execute-tool` single-tool path, a Workers-compat smoke (Miniflare), and the `edgeFunctionClient` flip. Concurrent-child / N-children stay deferred (stages 2–3): `listPending` is a collection, executions are addressed by `execution_id`, and an "input source" concept is named — but not implemented.

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `noUncheckedIndexedAccess`), Postgres via `@supabase/supabase-js` (service-role; Node `process.env` in 4a, Cloudflare **Hyperdrive** binding in 4b), the RU3 runtime core (`executeTurn` / `DispatchStrategy` / `DispatchPersistence` / `ChildResult` from `packages/api`), RU2 `McpPoolClient` (`createMcpPoolClient`), RU1 `shared-store-services` factories, Jest ESM (`unstable_mockModule`), Cloudflare Workers (`wrangler`, `[triggers] crons`, `scheduled()`, `ctx.waitUntil(fetch(self))`), Miniflare for the Workers-compat smoke.

## Global Constraints

- npm workspaces. ESM (`"type":"module"`, NodeNext). TS strict, `noUncheckedIndexedAccess`. **Never `any`. Never eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helpers/files, never compress code onto single lines. (Large surface — decompose hard.)
- Tests: Jest ESM — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full gate: `npm run check`.
- **Migration files are WRITTEN, NOT APPLIED** (user applies). Stage files explicitly (never `git add -A` / `-am`).
- Prettier: single quotes, 2-space indent, width 110, trailing comma es5; `@trivago/prettier-plugin-sort-imports` import sorting.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Decisions / spec-vs-code findings (READ BEFORE STARTING — these are NOT silent fixes)

Verified against the real code, migrations, and the RU1/RU2/RU3 plans. Where the spec assumes a shape the code does not have, this plan implements against the real code/contract and flags it here.

1. **`pending_resumes` is RE-INTRODUCED WITH A DIFFERENT COLUMN SET than the dropped one — spec §6 wins.** The original `pending_resumes` (created in `20260403100000_agent_composition.sql`, dropped in `20260618200000_drop_resume_queue_tables.sql`) had `session_id, parent_execution_id, parent_tool_output_message_id, child_output text, child_status, parent_session_state jsonb, status, attempts, last_attempt_at, created_at, root_execution_id, UNIQUE(parent_execution_id)`. **Spec §6 asks for an *adapted* table: `(execution_id, reason, idempotency_key, status, last_attempt_at, created_at)`.** The spec's shape is reason-driven (it carries *why* to resume, not the child's output — the child output now lives on `agent_stack_entries`/messages and is read on resume), and idempotency-keyed. This plan builds the spec's adapted shape (Task 1), NOT a verbatim restore. **FLAGGED:** this diverges from the dropped table; the `child_output`/`child_status`/`parent_tool_output_message_id` columns are intentionally NOT restored because the durable resume reads child outcome from the stack/messages, not from this row.

2. **`claim_pending_resumes` previously existed and was dropped — we recreate it, staleness-gated.** `20260410100000_atomic_worker_claims.sql` defined `claim_pending_resumes(p_limit integer) RETURNS SETOF pending_resumes` with `UPDATE … SET status='processing', last_attempt_at=now() WHERE id IN (SELECT id … WHERE status='pending' ORDER BY created_at ASC LIMIT p_limit FOR UPDATE SKIP LOCKED) RETURNING *`. RU4's spec §5 adds a **staleness gate** (rows stale beyond ~60s) so the cron sweep never races a healthy direct re-invoke. We recreate the RPC with an added `p_stale_seconds` predicate (Task 1).

3. **The "durable mechanism" already exists at dispatch-boundary granularity — RU4 generalizes it to per-step.** Production today: `executeCoreInlineDispatch.ts` (`handleInlineDispatch`) suspends the parent to `agent_stack_entries.parent_session_state` + writes a `__CHILD_PENDING__` placeholder tool-result message + sets `agent_executions.status='suspended'` + pushes a stack entry; `executeCoreChildFinish.ts` (`handleChildFinish`) resumes by updating the placeholder, popping the stack, and re-invoking `executeAgentCore` with `continueExecutionId`. RU4 reuses this exact suspend/resume *shape* but (a) moves persistence to per-step via the loop callbacks and (b) drives suspend through the injected `DurableDispatchStrategy` instead of inline recursion. **The current inline path recurses in-process (`executeAgentCore(childInput)` at `executeCoreInlineDispatch.ts:210`); under the durable model the invocation must END after `beforeDispatch`, not recurse.** This is the core behavioral change.

4. **Persistence is at execution *boundaries* today, not per-step — RU4 moves it.** `executePersistence.ts` (`persistPostExecution`) and `executeCoreHelpers.ts` (`persistMessagingPostExecution`) run once at the end of an execution. The loop (`packages/api/src/agentLoop/agentLoop.ts`) fires `onStepProcessed` (required) every step and `onToolExecuted?` per tool call — today only for streaming, NOT DB writes. RU4 hooks these to write each step's output as it completes. **`onToolExecuted` fires inside `appendResponseMessages` AFTER `onStepProcessed` for that step**, and only for non-finish/non-dispatch steps (the loop returns early on a finish/dispatch sentinel before appending — see `runLoopStep` at `agentLoop.ts:148-172`). The per-step checkpoint hook design must account for that ordering (Task 2).

5. **`maxDispatchDepth` is scattered and defaults to 10 — RU4 collapses to ONE const default 3.** Locations: `MAX_DEPTH=10` (`executeCoreInlineDispatch.ts:12`), `DEFAULT_MAX_NESTING_DEPTH=10` (`backend/src/routes/simulateAgentHandler.ts` and `packages/api/src/types/agentConfig.ts`), and RU3 exports `MAX_DISPATCH_DEPTH=10` from `packages/api/src/runtime/types.ts`. North-star §6.1 said 10; **RU4 §9 overrides to 3** as a single configurable const, N-safe. **The user's requirement is ONE variable used everywhere — sim AND prod.** Since both runtimes run the RU3 core (`executeTurn`/`childDispatch`), the core's `MAX_DISPATCH_DEPTH` (`packages/api/src/runtime/types.ts`, = **3**) is the **sole authority**. Task 8 therefore: sets `MAX_DISPATCH_DEPTH = 3`; replaces the prod-path `MAX_DEPTH=10` (`executeCoreInlineDispatch.ts:12`) with an import of it; and **consolidates the legacy `DEFAULT_MAX_NESTING_DEPTH=10` (`simulateAgentHandler.ts`, `agentConfig.ts`) onto the same const** — redirect the imports to `MAX_DISPATCH_DEPTH` (or delete `DEFAULT_MAX_NESTING_DEPTH` as dead once the sim handler runs on `executeTurn` per RU3). **No path is left at 10.** (Coordinate with RU3: its sim migration should already route depth through the core const; RU4 sets the value to 3 and removes any residual duplicate.)

6. **RU3 `DispatchPersistence`/`DispatchHandle` final shapes (read directly from RU3 Task 4, lines 508–525):** `DispatchHandle = { executionId: string; childExecutionId: string }`; `DispatchPersistence = { beforeDispatch(args:{executionId,parentSnapshot,childInput}):Promise<DispatchHandle>; onChildFinish(args:{handle,childResult}):Promise<void>; onChildError(args:{handle,error}):Promise<void>; listPending(executionId:string):Promise<DispatchHandle[]> }`. `DispatchOutcome = {kind:'completed';childResult} | {kind:'suspended';handle}`. `DispatchStrategy = { dispatch(args:DispatchArgs):Promise<DispatchOutcome> }` where `DispatchArgs = { dispatchDepth; maxDispatchDepth; runChild:()=>Promise<ChildResult> }`. **FLAGGED cross-RU dependency:** a parallel exploration of the RU3 plan reported a different `DispatchPersistence` (`persist`/`resume`) and a richer `DispatchHandle` (`sessionId`/`dispatchId`/`dispatchedAt`/`parentLastMessage`) — that appears to be a misread of a draft section. This plan implements against the §6/§10.1 spec + RU3 Task 4 text (`beforeDispatch`/`onChildFinish`/`onChildError`/`listPending`). **If RU3 actually shipped the `persist`/`resume` shape, reconcile before Task 3 — the durable persistence impl is built to the four-method contract.**

7. **RU1 package name is ambiguous across plans.** The RU1 plan/agent reports `@openflow/shared-store-services`; the RU3 plan references `@daviddh/shared-store-services`. The Worker (Task 10) imports the RU1 factories; use whatever name RU1 actually published (`grep '"name"' packages/shared-store-services/package.json` at impl time). **FLAGGED cross-RU dependency.**

8. **RU2 client contract (confirmed):** `createMcpPoolClient({ baseUrl, masterKey, fetch? }): McpInvoker` from `packages/api/src/providers/mcp/poolClient.ts`; `McpInvoker.invoke({ agentId, tenantId, mcpBindingId, toolName, args }): Promise<unknown>`. The Worker holds no MCP connections — it calls the BE pool over `/internal/mcp/invoke`. This matches `RuntimeServices.mcpPool` (RU3 Task 4).

9. **`packages/worker` and `wrangler.toml` do not exist yet** (`ls packages/` → api, backend, graph-types, landing, shared-validation, web, widget; no `wrangler.toml` anywhere). 4b is greenfield. **Cloudflare specifics (Hyperdrive binding shape, `ctx.waitUntil(fetch(self))` self-invoke limits, `scheduled()` signature, cron syntax) are documented as ASSUMPTIONS and verified against a real deploy in Task 14/16 — FLAGGED wherever not verifiable from the repo.**

10. **`agent_executions.status` already supports `suspended`** (`running/completed/failed/suspended`, from `20260409100000`). No new status enum value is needed for suspend. RU4 adds a per-step **position marker** — design choice (Task 2): store it in `agent_stack_entries.parent_session_state` for dispatched executions (existing) and add a small `agent_executions` JSONB/text column (`resume_marker`) for budget/input suspends of non-dispatched executions. **FLAGGED:** a new column on `agent_executions` is a migration (Task 2); confirm column name `resume_marker jsonb` is acceptable.

11. **The Worker imports the durable impls; where do they live?** Spec §14 offers a choice ("`packages/api/src/capabilities/{…}` durable impls OR `packages/backend` if the impls live BE-side and the Worker imports them"). **Decision: the durable impls live in `packages/api`** (`packages/api/src/production/`) so BOTH the Node backend (4a tests/driver) and the Worker (4b) import one implementation — the whole point of 4a is to build+test them in Node before the host move. They depend only on a `SupabaseLike` client + the query helpers, which are injected. **FLAGGED:** this requires the per-step + dispatch query helpers (today in `packages/backend/src/db/queries/*` and `executePersistence.ts`) to be reachable from `packages/api`. The durable impls in `packages/api` take a **`DurableQueries` port** (an injected interface, Task 3) so `packages/api` never imports `packages/backend`; the Node backend and the Worker each supply a concrete `DurableQueries` over their own `supabase` client.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/<ts>_reintroduce_pending_resumes.sql` (create) | Adapted `pending_resumes(execution_id, reason, idempotency_key, status, last_attempt_at, created_at)` + indexes + `claim_pending_resumes(p_limit, p_stale_seconds)` RPC (staleness-gated). |
| `supabase/migrations/<ts>_execution_resume_marker.sql` (create) | `agent_executions.resume_marker jsonb` (per-step position marker for non-dispatch suspends). |
| `packages/api/src/production/durableQueries.ts` (create) | `DurableQueries` port interface (the injected DB seam — no `packages/backend` import). |
| `packages/api/src/production/stepCheckpoint.ts` (create) | `makeStepCheckpointer(queries)`: hooks `onStepProcessed`/`onToolExecuted`; writes each step's output; advances `resume_marker`; tool-result-before-advance. |
| `packages/api/src/production/supabaseDispatchPersistence.ts` (create) | `SupabaseDispatchPersistence` (`beforeDispatch`/`onChildFinish`/`onChildError`/`listPending` collection) over `agent_stack_entries` + `pending_resumes`. |
| `packages/api/src/production/durableDispatchStrategy.ts` (create) | `DurableDispatchStrategy`: `beforeDispatch` → `{ kind:'suspended', handle }`; shares RU3 child-injection on resume. |
| `packages/api/src/production/resumeTrigger.ts` (create) | `writePendingResume` + `fireDirectReinvoke` (write row, then `ctx.waitUntil(fetch(self))` injected as a `Reinvoker`); idempotency-key check. |
| `packages/api/src/production/cronSweep.ts` (create) | Portable `sweepPendingResumes(queries, reinvoker, opts)` — BACKSTOP ONLY, staleness-gated, clearly labelled dropped-trigger fallback. |
| `packages/api/src/production/activeLeaf.ts` (create) | `resolveActiveLeaf(queries, conversationId)` → deepest non-sleeping `execution_id` under the root. |
| `packages/api/src/production/idempotency.ts` (create) | `makeIdempotencyKey` + `assertNotAlreadyApplied` against persisted run state. |
| `packages/api/src/production/index.ts` (create) | Barrel for the durable impls. |
| `packages/api/src/runtime/types.ts` (modify) | `MAX_DISPATCH_DEPTH` → single const **3**; export `DEFAULT_MAX_DISPATCH_DEPTH`. |
| `packages/api/src/index.ts` (modify) | Re-export durable impls + the depth const. |
| `packages/backend/src/db/queries/durableQueriesImpl.ts` (create) | Node `DurableQueries` impl over the backend `SupabaseClient` (reuses `executePersistence`/`stackQueries`/`messageQueries`). |
| `packages/backend/src/routes/execute/durableRunDriver.ts` (create) | Node durable-run driver: wires caps + `DurableQueries` + a no-op/local `Reinvoker`, runs `executeTurn` with durable caps; used by the 4a end-to-end test. |
| `packages/backend/src/routes/execute/__tests__/durableRun.e2e.test.ts` (create) | 4a end-to-end multi-suspend resume test (forced budget suspends + a child dispatch). |
| `packages/worker/src/index.ts` (create) | Worker `fetch` (new run / human resume / direct re-invoke) + `scheduled()` (cron backstop). |
| `packages/worker/src/workerSupabase.ts` (create) | service-role `@supabase/supabase-js` client over the Hyperdrive binding. |
| `packages/worker/src/runDurable.ts` (create) | Wires `RuntimeCapabilities` (DurableDispatchStrategy, SupabaseDispatchPersistence, OTel/structured logger, token-bucket) + `RuntimeServices` + a `fetch(self)` `Reinvoker`; runs `executeTurn`. |
| `packages/worker/src/singleTool.ts` (create) | Folds in the former `execute-tool` (Play button) single-tool execution. |
| `packages/worker/src/workerDurableQueries.ts` (create) | Worker `DurableQueries` impl over `workerSupabase`. |
| `packages/worker/wrangler.toml` (create) | Bindings (Hyperdrive, master key, MCP base URL), `[triggers] crons`, limits. |
| `packages/worker/package.json` / `tsconfig.json` (create) | Workspace package wiring. |
| `packages/worker/src/__tests__/workersCompat.smoke.test.ts` (create) | Miniflare smoke: RU3 core + RU1 import + run clean on the Workers runtime. |
| `packages/backend/src/routes/execute/edgeFunctionClient.ts` (modify) | Flip the fetch URL/path from the Supabase edge to the Worker. |

---

## Phase 4a — durable dispatch (Node)

### Task 1: Migration — re-introduce adapted `pending_resumes` + `claim_pending_resumes` RPC

**Files:**
- Create: `supabase/migrations/20260625100000_reintroduce_pending_resumes.sql`
- Test: `packages/backend/src/db/queries/__tests__/pendingResumesShape.test.ts`

**Interfaces:**
- Consumes: existing `agent_executions(id)` FK target.
- Produces (SQL surface, consumed by Task 3 query helpers): table `pending_resumes(id uuid pk, execution_id uuid not null references agent_executions(id), reason text not null check (reason in ('budget','input','dispatch')), idempotency_key text not null, status text not null default 'pending' check (status in ('pending','processing','completed','failed')), last_attempt_at timestamptz, created_at timestamptz not null default now(), unique(idempotency_key))`; RPC `claim_pending_resumes(p_limit integer, p_stale_seconds integer) returns setof pending_resumes`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/db/queries/__tests__/pendingResumesShape.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const SQL = readFileSync(
  'supabase/migrations/20260625100000_reintroduce_pending_resumes.sql',
  'utf8'
);

describe('reintroduce_pending_resumes migration', () => {
  it('creates pending_resumes with the adapted column set', () => {
    expect(SQL).toMatch(/create table\s+(public\.)?pending_resumes/i);
    for (const col of ['execution_id', 'reason', 'idempotency_key', 'status', 'last_attempt_at', 'created_at']) {
      expect(SQL).toContain(col);
    }
    // The dropped columns must NOT be restored (spec §6 adaptation).
    expect(SQL).not.toContain('child_output');
    expect(SQL).not.toContain('child_status');
  });

  it('enforces idempotency_key uniqueness', () => {
    expect(SQL.toLowerCase()).toContain('unique (idempotency_key)');
  });

  it('defines a staleness-gated claim_pending_resumes RPC', () => {
    expect(SQL).toMatch(/create or replace function\s+claim_pending_resumes\s*\(\s*p_limit integer\s*,\s*p_stale_seconds integer\s*\)/i);
    expect(SQL.toLowerCase()).toContain('for update skip locked');
    expect(SQL.toLowerCase()).toContain("status = 'pending'");
    expect(SQL.toLowerCase()).toContain('last_attempt_at');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=pendingResumesShape`
Expected: FAIL — migration file does not exist (`ENOENT`).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260625100000_reintroduce_pending_resumes.sql
-- RU4 §6: re-introduce pending_resumes in an ADAPTED shape (reason + idempotency_key),
-- NOT the dropped 2026-06-18 shape. Child outcome is read from agent_stack_entries /
-- messages on resume; this row only carries WHY to resume.

create table if not exists public.pending_resumes (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.agent_executions(id),
  reason text not null check (reason in ('budget', 'input', 'dispatch')),
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists idx_pending_resumes_pending
  on public.pending_resumes (created_at)
  where status = 'pending';

create index if not exists idx_pending_resumes_execution
  on public.pending_resumes (execution_id);

-- BACKSTOP claim (cron sweep, RU4 §5): only rows that are pending AND stale beyond
-- p_stale_seconds (a *dropped* direct re-invoke). The staleness gate keeps the sweep
-- from racing a healthy direct re-invoke; idempotency_key absorbs any double-fire.
create or replace function public.claim_pending_resumes(p_limit integer, p_stale_seconds integer)
returns setof public.pending_resumes
language sql
as $$
  update public.pending_resumes
  set status = 'processing', last_attempt_at = now()
  where id in (
    select id from public.pending_resumes
    where status = 'pending'
      and created_at < now() - make_interval(secs => p_stale_seconds)
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  returning *;
$$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=pendingResumesShape`
Expected: PASS

- [ ] **Step 5: Commit** (migration written, NOT applied — user applies)

```bash
git add supabase/migrations/20260625100000_reintroduce_pending_resumes.sql packages/backend/src/db/queries/__tests__/pendingResumesShape.test.ts
git commit -m "feat(db): re-introduce adapted pending_resumes + staleness-gated claim RPC (RU4 §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Per-step checkpoint persistence (hook the loop callbacks; tool-result-before-advance) + `resume_marker` migration

**Files:**
- Create: `supabase/migrations/20260625100100_execution_resume_marker.sql`
- Create: `packages/api/src/production/durableQueries.ts`
- Create: `packages/api/src/production/stepCheckpoint.ts`
- Test: `packages/api/src/production/__tests__/stepCheckpoint.test.ts`

**Interfaces:**
- Consumes: `AgentLoopCallbacks` (`packages/api/src/agentLoop/agentLoopTypes.ts` — `onStepStarted?(step)`, `onStepProcessed(event)`, `onToolExecuted?(event)`), `AgentStepEvent`, `AgentToolEvent`, `AgentToolCallRecord`.
- Produces:
  - `packages/api/src/production/durableQueries.ts`: `export interface DurableQueries { writeStepOutput(a:{ executionId; step; responseText; responseMessages: unknown[]; reasoning?: string; tokens:{input:number;output:number;cached:number;costUSD?:number}; durationMs:number }): Promise<void>; writeToolResult(a:{ executionId; step; toolCallId; toolName; output: unknown }): Promise<void>; advanceResumeMarker(a:{ executionId; marker: Record<string, unknown> }): Promise<void>; }` (plus the dispatch/resume/leaf/idempotency methods added in Tasks 3,5,6,7,9 — declared incrementally).
  - `packages/api/src/production/stepCheckpoint.ts`: `export function makeStepCheckpointer(queries: DurableQueries, executionId: string): Pick<AgentLoopCallbacks, 'onStepProcessed' | 'onToolExecuted'>` — `onStepProcessed` writes the step output then advances the marker to `{ phase: 'awaiting_llm', step }`; `onToolExecuted` writes the tool result and advances the marker to `{ phase: 'pending_tool_calls', step, lastToolCallId }` — **the tool result write completes before the advance**, so a resume never re-fires a completed tool.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/stepCheckpoint.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DurableQueries } from '../durableQueries.js';
import { makeStepCheckpointer } from '../stepCheckpoint.js';

function fakeQueries(): { q: DurableQueries; calls: string[] } {
  const calls: string[] = [];
  const q = {
    writeStepOutput: jest.fn(async () => { calls.push('writeStepOutput'); }),
    writeToolResult: jest.fn(async () => { calls.push('writeToolResult'); }),
    advanceResumeMarker: jest.fn(async () => { calls.push('advanceResumeMarker'); }),
  } as unknown as DurableQueries;
  return { q, calls };
}

describe('makeStepCheckpointer', () => {
  it('onStepProcessed writes the step output then advances the marker', async () => {
    const { q, calls } = fakeQueries();
    const cb = makeStepCheckpointer(q, 'exec-1');
    await cb.onStepProcessed({
      step: 1, messagesSent: [], responseText: 'hi', responseMessages: [],
      toolCalls: [], tokens: { input: 1, output: 2, cached: 0 }, durationMs: 5,
    });
    expect(calls).toEqual(['writeStepOutput', 'advanceResumeMarker']);
  });

  it('onToolExecuted persists the tool result BEFORE advancing the marker', async () => {
    const { q, calls } = fakeQueries();
    const cb = makeStepCheckpointer(q, 'exec-1');
    await cb.onToolExecuted?.({
      step: 1,
      toolCall: { toolCallId: 'tc1', toolName: 'search', input: {}, output: { ok: true } },
    });
    expect(calls).toEqual(['writeToolResult', 'advanceResumeMarker']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/stepCheckpoint`
Expected: FAIL — cannot find module `../stepCheckpoint.js` / `../durableQueries.js`.

- [ ] **Step 3: Write the migration + minimal implementation**

```sql
-- supabase/migrations/20260625100100_execution_resume_marker.sql
-- RU4 §3/§6: per-step position marker for budget/input suspends of non-dispatch
-- executions. Dispatched executions keep their marker in
-- agent_stack_entries.parent_session_state (existing); this covers the rest.
alter table public.agent_executions
  add column if not exists resume_marker jsonb;

-- RU4 §15: per-EXECUTION active-time accumulator enforcing maxChildRuntimeMs (1h).
-- Per execution_id, NOT shared across siblings — each child gets its own 1h.
-- Incremented by each invocation's active ms on suspend/checkpoint; checked on resume.
alter table public.agent_executions
  add column if not exists accumulated_active_ms bigint not null default 0;
```

> **Accumulator wiring (RU4 §15, per-execution):** on each invocation, measure active ms (start-to-suspend wall time minus idle waits, or a CPU-ms proxy) and `update agent_executions set accumulated_active_ms = accumulated_active_ms + :delta where id = :executionId` as part of the suspend/checkpoint write. On **resume**, before continuing, if `accumulated_active_ms >= maxChildRuntimeMs` terminate *that* execution with `ChildResult { status:'error', code:'timeout' }` (which the parent injection then surfaces). Because it's keyed by `execution_id`, sibling children never share the budget.

```ts
// packages/api/src/production/durableQueries.ts
export interface StepOutputWrite {
  executionId: string;
  step: number;
  responseText: string;
  responseMessages: unknown[];
  reasoning?: string;
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs: number;
}

export interface ToolResultWrite {
  executionId: string;
  step: number;
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface ResumeMarker {
  phase: 'awaiting_llm' | 'pending_tool_calls';
  step: number;
  lastToolCallId?: string;
}

export interface DurableQueries {
  writeStepOutput(write: StepOutputWrite): Promise<void>;
  writeToolResult(write: ToolResultWrite): Promise<void>;
  advanceResumeMarker(args: { executionId: string; marker: ResumeMarker }): Promise<void>;
}
```

```ts
// packages/api/src/production/stepCheckpoint.ts
import type { AgentLoopCallbacks, AgentStepEvent, AgentToolEvent } from '../agentLoop/agentLoopTypes.js';
import type { DurableQueries } from './durableQueries.js';

type StepCheckpointCallbacks = Pick<AgentLoopCallbacks, 'onStepProcessed' | 'onToolExecuted'>;

export function makeStepCheckpointer(queries: DurableQueries, executionId: string): StepCheckpointCallbacks {
  async function onStepProcessed(event: AgentStepEvent): Promise<void> {
    await queries.writeStepOutput({
      executionId,
      step: event.step,
      responseText: event.responseText,
      responseMessages: event.responseMessages,
      reasoning: event.reasoning,
      tokens: { input: event.tokens.input, output: event.tokens.output, cached: event.tokens.cached },
      durationMs: event.durationMs,
    });
    await queries.advanceResumeMarker({ executionId, marker: { phase: 'awaiting_llm', step: event.step } });
  }

  async function onToolExecuted(event: AgentToolEvent): Promise<void> {
    await queries.writeToolResult({
      executionId,
      step: event.step,
      toolCallId: event.toolCall.toolCallId,
      toolName: event.toolCall.toolName,
      output: event.toolCall.output,
    });
    await queries.advanceResumeMarker({
      executionId,
      marker: { phase: 'pending_tool_calls', step: event.step, lastToolCallId: event.toolCall.toolCallId },
    });
  }

  return { onStepProcessed, onToolExecuted };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/stepCheckpoint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260625100100_execution_resume_marker.sql packages/api/src/production/durableQueries.ts packages/api/src/production/stepCheckpoint.ts packages/api/src/production/__tests__/stepCheckpoint.test.ts
git commit -m "feat(api): per-step checkpoint hooks (DurableQueries port, tool-result-before-advance) + resume_marker migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `SupabaseDispatchPersistence` — dispatch ops over `agent_stack_entries` (+ `listPending` collection)

**Files:**
- Modify: `packages/api/src/production/durableQueries.ts` (add dispatch methods)
- Create: `packages/api/src/production/supabaseDispatchPersistence.ts`
- Test: `packages/api/src/production/__tests__/supabaseDispatchPersistence.test.ts`

**Interfaces:**
- Consumes: `DispatchPersistence`, `DispatchHandle` (RU3 `@daviddh/llm-graph-runner` / `../capabilities/dispatchPersistence.js`), `ChildResult` (RU3), `DurableQueries` (Task 2).
- Produces:
  - extend `DurableQueries` with: `pushDispatch(a:{ parentExecutionId; childExecutionId; parentSnapshot: Record<string,unknown>; childInput: Record<string,unknown>; rootExecutionId: string }): Promise<void>; writeChildOutcome(a:{ parentExecutionId; childResult: ChildResult }): Promise<void>; enqueueResume(a:{ executionId; reason: 'budget'|'input'|'dispatch'; idempotencyKey: string }): Promise<void>; listPendingDispatches(executionId: string): Promise<DispatchHandle[]>;`
  - `export function makeSupabaseDispatchPersistence(queries: DurableQueries, rootExecutionId: string): DispatchPersistence` — `beforeDispatch` calls `pushDispatch` (persisting `parentSnapshot` into `agent_stack_entries.parent_session_state`, creating the child) and returns `{ executionId, childExecutionId }`; `onChildFinish` calls `writeChildOutcome` then `enqueueResume({ reason:'dispatch' })`; `onChildError` calls `writeChildOutcome` (error envelope) then `enqueueResume`; `listPending` returns `listPendingDispatches` (a **collection** — RU4 uses one element, stage 3 N).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/supabaseDispatchPersistence.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DurableQueries } from '../durableQueries.js';
import { makeSupabaseDispatchPersistence } from '../supabaseDispatchPersistence.js';

function fakeQueries(): { q: DurableQueries; calls: string[] } {
  const calls: string[] = [];
  const q = {
    writeStepOutput: jest.fn(), writeToolResult: jest.fn(), advanceResumeMarker: jest.fn(),
    pushDispatch: jest.fn(async () => { calls.push('pushDispatch'); }),
    writeChildOutcome: jest.fn(async () => { calls.push('writeChildOutcome'); }),
    enqueueResume: jest.fn(async () => { calls.push('enqueueResume'); }),
    listPendingDispatches: jest.fn(async () => [{ executionId: 'p1', childExecutionId: 'c1' }]),
  } as unknown as DurableQueries;
  return { q, calls };
}

describe('makeSupabaseDispatchPersistence', () => {
  it('beforeDispatch persists the parent snapshot + child and returns the handle', async () => {
    const { q } = fakeQueries();
    const p = makeSupabaseDispatchPersistence(q, 'root-1');
    const handle = await p.beforeDispatch({
      executionId: 'p1',
      parentSnapshot: { currentNodeId: 'n1' },
      childInput: { childExecutionId: 'c1', task: 'do it' },
    });
    expect(handle).toEqual({ executionId: 'p1', childExecutionId: 'c1' });
  });

  it('onChildFinish writes the outcome then enqueues a dispatch resume', async () => {
    const { q, calls } = fakeQueries();
    const p = makeSupabaseDispatchPersistence(q, 'root-1');
    await p.onChildFinish({
      handle: { executionId: 'p1', childExecutionId: 'c1' },
      childResult: { status: 'finished', result: 'done', outcome: 'success' },
    });
    expect(calls).toEqual(['writeChildOutcome', 'enqueueResume']);
  });

  it('listPending returns a collection', async () => {
    const { q } = fakeQueries();
    const p = makeSupabaseDispatchPersistence(q, 'root-1');
    expect(await p.listPending('p1')).toEqual([{ executionId: 'p1', childExecutionId: 'c1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/supabaseDispatchPersistence`
Expected: FAIL — cannot find module `../supabaseDispatchPersistence.js`.

- [ ] **Step 3: Write minimal implementation** (extend `durableQueries.ts`, then the impl)

Append to `packages/api/src/production/durableQueries.ts`:

```ts
// packages/api/src/production/durableQueries.ts  (append)
import type { ChildResult, DispatchHandle } from '../capabilities/index.js';

export interface PushDispatchArgs {
  parentExecutionId: string;
  childExecutionId: string;
  parentSnapshot: Record<string, unknown>;
  childInput: Record<string, unknown>;
  rootExecutionId: string;
}

export interface DurableQueriesDispatch {
  pushDispatch(args: PushDispatchArgs): Promise<void>;
  writeChildOutcome(args: { parentExecutionId: string; childResult: ChildResult }): Promise<void>;
  enqueueResume(args: { executionId: string; reason: 'budget' | 'input' | 'dispatch'; idempotencyKey: string }): Promise<void>;
  listPendingDispatches(executionId: string): Promise<DispatchHandle[]>;
}
```

Change the `DurableQueries` interface to extend the dispatch slice:

```ts
// in packages/api/src/production/durableQueries.ts — replace the interface header line
export interface DurableQueries extends DurableQueriesDispatch {
  writeStepOutput(write: StepOutputWrite): Promise<void>;
  writeToolResult(write: ToolResultWrite): Promise<void>;
  advanceResumeMarker(args: { executionId: string; marker: ResumeMarker }): Promise<void>;
}
```

```ts
// packages/api/src/production/supabaseDispatchPersistence.ts
import type { ChildResult, DispatchHandle, DispatchPersistence } from '../capabilities/index.js';
import type { DurableQueries } from './durableQueries.js';

function childExecutionIdFromInput(childInput: unknown): string {
  if (typeof childInput === 'object' && childInput !== null && 'childExecutionId' in childInput) {
    const value = (childInput as { childExecutionId: unknown }).childExecutionId;
    if (typeof value === 'string') return value;
  }
  throw new Error('childInput must carry a string childExecutionId');
}

function dispatchKey(parentExecutionId: string, childExecutionId: string): string {
  return `dispatch:${parentExecutionId}:${childExecutionId}`;
}

export function makeSupabaseDispatchPersistence(
  queries: DurableQueries,
  rootExecutionId: string
): DispatchPersistence {
  async function beforeDispatch(args: {
    executionId: string;
    parentSnapshot: unknown;
    childInput: unknown;
  }): Promise<DispatchHandle> {
    const childExecutionId = childExecutionIdFromInput(args.childInput);
    await queries.pushDispatch({
      parentExecutionId: args.executionId,
      childExecutionId,
      parentSnapshot: (args.parentSnapshot as Record<string, unknown>) ?? {},
      childInput: (args.childInput as Record<string, unknown>) ?? {},
      rootExecutionId,
    });
    return { executionId: args.executionId, childExecutionId };
  }

  async function onChildFinish(args: { handle: DispatchHandle; childResult: ChildResult }): Promise<void> {
    await queries.writeChildOutcome({ parentExecutionId: args.handle.executionId, childResult: args.childResult });
    await queries.enqueueResume({
      executionId: args.handle.executionId,
      reason: 'dispatch',
      idempotencyKey: dispatchKey(args.handle.executionId, args.handle.childExecutionId),
    });
  }

  async function onChildError(args: { handle: DispatchHandle; error: unknown }): Promise<void> {
    const message = args.error instanceof Error ? args.error.message : 'child error';
    await queries.writeChildOutcome({
      parentExecutionId: args.handle.executionId,
      childResult: { status: 'error', code: 'child_failed', message },
    });
    await queries.enqueueResume({
      executionId: args.handle.executionId,
      reason: 'dispatch',
      idempotencyKey: dispatchKey(args.handle.executionId, args.handle.childExecutionId),
    });
  }

  async function listPending(executionId: string): Promise<DispatchHandle[]> {
    return await queries.listPendingDispatches(executionId);
  }

  return { beforeDispatch, onChildFinish, onChildError, listPending };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/supabaseDispatchPersistence`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/production/durableQueries.ts packages/api/src/production/supabaseDispatchPersistence.ts packages/api/src/production/__tests__/supabaseDispatchPersistence.test.ts
git commit -m "feat(api): SupabaseDispatchPersistence (dispatch ops over agent_stack_entries, listPending collection)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `DurableDispatchStrategy` — suspend → `{ kind:'suspended' }`, shares RU3 child-injection

**Files:**
- Create: `packages/api/src/production/durableDispatchStrategy.ts`
- Test: `packages/api/src/production/__tests__/durableDispatchStrategy.test.ts`

**Interfaces:**
- Consumes: `DispatchStrategy`, `DispatchArgs`, `DispatchOutcome`, `DispatchHandle`, `DispatchPersistence` (RU3); a `prepareChild(args: DispatchArgs): Promise<{ executionId: string; parentSnapshot: Record<string,unknown>; childInput: Record<string,unknown> }>` injected closure (the driver supplies the parent snapshot + minted child execution id).
- Produces: `export function makeDurableDispatchStrategy(persistence: DispatchPersistence, prepareChild: PrepareChild): DispatchStrategy` — on `dispatch`, depth-guard (`dispatchDepth+1 > maxDispatchDepth` → return `{ kind:'completed', childResult:{ status:'error', code:'max_depth_exceeded', message } }` WITHOUT suspending), else `await persistence.beforeDispatch(prepared)`, return `{ kind:'suspended', handle }`. **It never calls `args.runChild`** — the child is a separate invocation. On resume the child's `ChildResult` is read from persistence and injected via RU3's shared `injectChildResultIntoParent` (driver-side, Task 9), exactly as `SyncRecurseStrategy`'s `completed` branch does.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/durableDispatchStrategy.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DispatchPersistence } from '../../capabilities/index.js';
import { makeDurableDispatchStrategy } from '../durableDispatchStrategy.js';

function fakePersistence(): DispatchPersistence {
  return {
    beforeDispatch: jest.fn(async () => ({ executionId: 'p1', childExecutionId: 'c1' })),
    onChildFinish: jest.fn(async () => undefined),
    onChildError: jest.fn(async () => undefined),
    listPending: jest.fn(async () => []),
  };
}

describe('makeDurableDispatchStrategy', () => {
  it('suspends (never runs the child inline)', async () => {
    const persistence = fakePersistence();
    const runChild = jest.fn();
    const strat = makeDurableDispatchStrategy(persistence, async () => ({
      executionId: 'p1', parentSnapshot: { currentNodeId: 'n1' }, childInput: { childExecutionId: 'c1' },
    }));
    const out = await strat.dispatch({ dispatchDepth: 0, maxDispatchDepth: 3, runChild });
    expect(out).toEqual({ kind: 'suspended', handle: { executionId: 'p1', childExecutionId: 'c1' } });
    expect(runChild).not.toHaveBeenCalled();
    expect(persistence.beforeDispatch).toHaveBeenCalledTimes(1);
  });

  it('short-circuits at max depth WITHOUT suspending', async () => {
    const persistence = fakePersistence();
    const strat = makeDurableDispatchStrategy(persistence, async () => ({
      executionId: 'p1', parentSnapshot: {}, childInput: { childExecutionId: 'c1' },
    }));
    const out = await strat.dispatch({ dispatchDepth: 3, maxDispatchDepth: 3, runChild: jest.fn() });
    expect(out.kind).toBe('completed');
    if (out.kind === 'completed' && out.childResult.status === 'error') {
      expect(out.childResult.code).toBe('max_depth_exceeded');
    }
    expect(persistence.beforeDispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/durableDispatchStrategy`
Expected: FAIL — cannot find module `../durableDispatchStrategy.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/production/durableDispatchStrategy.ts
import type {
  DispatchArgs,
  DispatchOutcome,
  DispatchPersistence,
  DispatchStrategy,
} from '../capabilities/index.js';

export interface PreparedChild {
  executionId: string;
  parentSnapshot: Record<string, unknown>;
  childInput: Record<string, unknown>;
}

export type PrepareChild = (args: DispatchArgs) => Promise<PreparedChild>;

export function makeDurableDispatchStrategy(
  persistence: DispatchPersistence,
  prepareChild: PrepareChild
): DispatchStrategy {
  async function dispatch(args: DispatchArgs): Promise<DispatchOutcome> {
    if (args.dispatchDepth + 1 > args.maxDispatchDepth) {
      return {
        kind: 'completed',
        childResult: { status: 'error', code: 'max_depth_exceeded', message: 'Max dispatch depth exceeded.' },
      };
    }
    const prepared = await prepareChild(args);
    const handle = await persistence.beforeDispatch({
      executionId: prepared.executionId,
      parentSnapshot: prepared.parentSnapshot,
      childInput: prepared.childInput,
    });
    return { kind: 'suspended', handle };
  }

  return { dispatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/durableDispatchStrategy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/production/durableDispatchStrategy.ts packages/api/src/production/__tests__/durableDispatchStrategy.test.ts
git commit -m "feat(api): DurableDispatchStrategy (suspend on dispatch, depth-guard, no inline child run)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Direct re-invoke trigger (write row + fire) + idempotency-key check

**Files:**
- Create: `packages/api/src/production/idempotency.ts`
- Create: `packages/api/src/production/resumeTrigger.ts`
- Modify: `packages/api/src/production/durableQueries.ts` (add idempotency lookup)
- Test: `packages/api/src/production/__tests__/resumeTrigger.test.ts`

**Interfaces:**
- Consumes: `DurableQueries` (Tasks 2–3).
- Produces:
  - `packages/api/src/production/idempotency.ts`: `export function makeIdempotencyKey(parts: { executionId: string; reason: 'budget'|'input'|'dispatch'; marker?: string }): string` and `export async function assertNotAlreadyApplied(queries: DurableQueries, idempotencyKey: string): Promise<boolean>` (true = first time / proceed; false = already applied → skip).
  - extend `DurableQueries` with `resumeAlreadyApplied(idempotencyKey: string): Promise<boolean>`.
  - `packages/api/src/production/resumeTrigger.ts`: `export interface Reinvoker { reinvoke(args: { executionId: string; idempotencyKey: string }): Promise<void> }` and `export async function triggerDirectReinvoke(args: { queries: DurableQueries; reinvoker: Reinvoker; executionId: string; reason: 'budget'|'input'|'dispatch'; marker?: string }): Promise<void>` — writes the `pending_resumes` row (via `enqueueResume`) **then** fires `reinvoker.reinvoke(...)` (in the Worker this is `ctx.waitUntil(fetch(self))`; in Node it is a no-op/local driver). The row-then-fire order means a dropped fire is still swept by the cron backstop (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/resumeTrigger.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DurableQueries } from '../durableQueries.js';
import { makeIdempotencyKey } from '../idempotency.js';
import { triggerDirectReinvoke, type Reinvoker } from '../resumeTrigger.js';

describe('makeIdempotencyKey', () => {
  it('is stable for the same parts', () => {
    const a = makeIdempotencyKey({ executionId: 'e1', reason: 'budget', marker: 'step-3' });
    const b = makeIdempotencyKey({ executionId: 'e1', reason: 'budget', marker: 'step-3' });
    expect(a).toBe(b);
  });
});

describe('triggerDirectReinvoke', () => {
  it('writes the pending row BEFORE firing the re-invoke', async () => {
    const calls: string[] = [];
    const queries = {
      enqueueResume: jest.fn(async () => { calls.push('enqueueResume'); }),
      resumeAlreadyApplied: jest.fn(async () => false),
    } as unknown as DurableQueries;
    const reinvoker: Reinvoker = { reinvoke: jest.fn(async () => { calls.push('reinvoke'); }) };
    await triggerDirectReinvoke({ queries, reinvoker, executionId: 'e1', reason: 'budget', marker: 'step-3' });
    expect(calls).toEqual(['enqueueResume', 'reinvoke']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/resumeTrigger`
Expected: FAIL — cannot find module `../resumeTrigger.js` / `../idempotency.js`.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/api/src/production/durableQueries.ts` (inside `DurableQueriesDispatch` or as a sibling slice — add the method to the `DurableQueries` interface body):

```ts
// add to the DurableQueries interface in durableQueries.ts
  resumeAlreadyApplied(idempotencyKey: string): Promise<boolean>;
```

```ts
// packages/api/src/production/idempotency.ts
import type { DurableQueries } from './durableQueries.js';

export interface IdempotencyParts {
  executionId: string;
  reason: 'budget' | 'input' | 'dispatch';
  marker?: string;
}

export function makeIdempotencyKey(parts: IdempotencyParts): string {
  return `${parts.reason}:${parts.executionId}:${parts.marker ?? 'none'}`;
}

export async function assertNotAlreadyApplied(
  queries: DurableQueries,
  idempotencyKey: string
): Promise<boolean> {
  const applied = await queries.resumeAlreadyApplied(idempotencyKey);
  return !applied;
}
```

```ts
// packages/api/src/production/resumeTrigger.ts
import type { DurableQueries } from './durableQueries.js';
import { makeIdempotencyKey } from './idempotency.js';

export interface Reinvoker {
  reinvoke(args: { executionId: string; idempotencyKey: string }): Promise<void>;
}

export interface TriggerArgs {
  queries: DurableQueries;
  reinvoker: Reinvoker;
  executionId: string;
  reason: 'budget' | 'input' | 'dispatch';
  marker?: string;
}

export async function triggerDirectReinvoke(args: TriggerArgs): Promise<void> {
  const idempotencyKey = makeIdempotencyKey({
    executionId: args.executionId,
    reason: args.reason,
    marker: args.marker,
  });
  await args.queries.enqueueResume({ executionId: args.executionId, reason: args.reason, idempotencyKey });
  await args.reinvoker.reinvoke({ executionId: args.executionId, idempotencyKey });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/resumeTrigger`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/production/idempotency.ts packages/api/src/production/resumeTrigger.ts packages/api/src/production/durableQueries.ts packages/api/src/production/__tests__/resumeTrigger.test.ts
git commit -m "feat(api): direct re-invoke trigger (row-then-fire) + idempotency keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cron sweep logic (portable, staleness-gated, labelled BACKSTOP) + `claimPendingResumes` query

**Files:**
- Create: `packages/api/src/production/cronSweep.ts`
- Modify: `packages/api/src/production/durableQueries.ts` (add `claimPendingResumes`)
- Test: `packages/api/src/production/__tests__/cronSweep.test.ts`

**Interfaces:**
- Consumes: `DurableQueries`, `Reinvoker` (Task 5).
- Produces:
  - extend `DurableQueries` with `claimPendingResumes(args: { limit: number; staleSeconds: number }): Promise<Array<{ executionId: string; idempotencyKey: string }>>` (calls the `claim_pending_resumes(p_limit, p_stale_seconds)` RPC from Task 1).
  - `packages/api/src/production/cronSweep.ts`: `export const SWEEP_STALE_SECONDS = 60;` and `export async function sweepPendingResumes(args: { queries: DurableQueries; reinvoker: Reinvoker; limit?: number; staleSeconds?: number }): Promise<number>` — **BACKSTOP ONLY. This is the dropped-trigger fallback (a sanity check), NEVER the primary mechanism.** Claims rows pending+stale beyond `staleSeconds` (default `SWEEP_STALE_SECONDS`) and re-fires each via `reinvoker.reinvoke`. Returns the count re-fired. The file header + the function doc comment MUST say so verbatim.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/cronSweep.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DurableQueries } from '../durableQueries.js';
import { SWEEP_STALE_SECONDS, sweepPendingResumes } from '../cronSweep.js';
import type { Reinvoker } from '../resumeTrigger.js';

describe('sweepPendingResumes (BACKSTOP only)', () => {
  it('claims stale rows and re-fires each', async () => {
    const claimed = [
      { executionId: 'e1', idempotencyKey: 'budget:e1:step-3' },
      { executionId: 'e2', idempotencyKey: 'dispatch:e2:c1' },
    ];
    const queries = { claimPendingResumes: jest.fn(async () => claimed) } as unknown as DurableQueries;
    const reinvoked: string[] = [];
    const reinvoker: Reinvoker = { reinvoke: jest.fn(async (a) => { reinvoked.push(a.executionId); }) };
    const count = await sweepPendingResumes({ queries, reinvoker });
    expect(count).toBe(2);
    expect(reinvoked).toEqual(['e1', 'e2']);
    expect(queries.claimPendingResumes).toHaveBeenCalledWith({ limit: expect.any(Number), staleSeconds: SWEEP_STALE_SECONDS });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/cronSweep`
Expected: FAIL — cannot find module `../cronSweep.js`.

- [ ] **Step 3: Write minimal implementation**

Add to the `DurableQueries` interface in `durableQueries.ts`:

```ts
  claimPendingResumes(args: { limit: number; staleSeconds: number }): Promise<Array<{ executionId: string; idempotencyKey: string }>>;
```

```ts
// packages/api/src/production/cronSweep.ts
//
// BACKSTOP ONLY — this is the DROPPED-TRIGGER FALLBACK (a sanity check), NEVER the
// primary resume mechanism. The primary path is the direct self-re-invoke
// (resumeTrigger.ts). This sweep exists solely to recover a *dropped* direct
// re-invoke. It is staleness-gated so it never races a healthy direct re-invoke,
// and any double-fire is absorbed by the idempotency key.
import type { DurableQueries } from './durableQueries.js';
import type { Reinvoker } from './resumeTrigger.js';

export const SWEEP_STALE_SECONDS = 60;
const DEFAULT_LIMIT = 100;

export interface SweepArgs {
  queries: DurableQueries;
  reinvoker: Reinvoker;
  limit?: number;
  staleSeconds?: number;
}

/**
 * BACKSTOP ONLY (dropped-trigger fallback). Claims pending_resumes rows that are
 * stale beyond `staleSeconds` and re-fires each. Never the main path.
 */
export async function sweepPendingResumes(args: SweepArgs): Promise<number> {
  const claimed = await args.queries.claimPendingResumes({
    limit: args.limit ?? DEFAULT_LIMIT,
    staleSeconds: args.staleSeconds ?? SWEEP_STALE_SECONDS,
  });
  for (const row of claimed) {
    await args.reinvoker.reinvoke({ executionId: row.executionId, idempotencyKey: row.idempotencyKey });
  }
  return claimed.length;
}
```

> `max-depth` is 2; the single `for` loop is fine. If lint flags `await`-in-loop, switch to `await Promise.all(claimed.map((row) => args.reinvoker.reinvoke(...)))` (the sweep is a backstop; concurrency is acceptable).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/cronSweep`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/production/cronSweep.ts packages/api/src/production/durableQueries.ts packages/api/src/production/__tests__/cronSweep.test.ts
git commit -m "feat(api): portable cron-sweep BACKSTOP (staleness-gated, labelled dropped-trigger fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Active-leaf routing — resolve the active leaf for a conversation

**Files:**
- Create: `packages/api/src/production/activeLeaf.ts`
- Modify: `packages/api/src/production/durableQueries.ts` (add leaf lookup)
- Test: `packages/api/src/production/__tests__/activeLeaf.test.ts`

**Interfaces:**
- Consumes: `DurableQueries`.
- Produces:
  - extend `DurableQueries` with `findActiveLeaf(conversationId: string): Promise<{ executionId: string; rootExecutionId: string } | null>` — the deepest non-sleeping execution under the conversation's root (addressed by `execution_id` in the `agent_stack_entries` tree; an execution is "sleeping" if it has a child stack entry above it). The query is the impl detail of the concrete `DurableQueries` (Task 9); the port just declares the shape.
  - `packages/api/src/production/activeLeaf.ts`: `export async function resolveActiveLeaf(queries: DurableQueries, conversationId: string): Promise<{ executionId: string; rootExecutionId: string }>` — returns the active leaf or throws a typed `NoActiveLeafError` if none. (In RU4 there is exactly one active leaf; stage 2/3 generalize to multiple addressable executions + an "input source" per execution — same lookup, richer result. **The return type is deliberately a single object now, with a comment that stage 3 widens it to a collection.**)

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/production/__tests__/activeLeaf.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import type { DurableQueries } from '../durableQueries.js';
import { NoActiveLeafError, resolveActiveLeaf } from '../activeLeaf.js';

describe('resolveActiveLeaf', () => {
  it('returns the deepest non-sleeping execution', async () => {
    const queries = {
      findActiveLeaf: jest.fn(async () => ({ executionId: 'leaf-1', rootExecutionId: 'root-1' })),
    } as unknown as DurableQueries;
    expect(await resolveActiveLeaf(queries, 'conv-1')).toEqual({ executionId: 'leaf-1', rootExecutionId: 'root-1' });
  });

  it('throws NoActiveLeafError when there is no live execution', async () => {
    const queries = { findActiveLeaf: jest.fn(async () => null) } as unknown as DurableQueries;
    await expect(resolveActiveLeaf(queries, 'conv-1')).rejects.toBeInstanceOf(NoActiveLeafError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/activeLeaf`
Expected: FAIL — cannot find module `../activeLeaf.js`.

- [ ] **Step 3: Write minimal implementation**

Add to `DurableQueries`:

```ts
  findActiveLeaf(conversationId: string): Promise<{ executionId: string; rootExecutionId: string } | null>;
```

```ts
// packages/api/src/production/activeLeaf.ts
import type { DurableQueries } from './durableQueries.js';

export class NoActiveLeafError extends Error {
  constructor(conversationId: string) {
    super(`No active leaf execution for conversation ${conversationId}`);
    this.name = 'NoActiveLeafError';
  }
}

// RU4: exactly one active leaf (sync sleep-model). Stage 2/3 widen this to a
// collection of addressable live executions + an "input source" per execution
// (real user vs parent-as-user) — same lookup, richer result. Do not preclude.
export async function resolveActiveLeaf(
  queries: DurableQueries,
  conversationId: string
): Promise<{ executionId: string; rootExecutionId: string }> {
  const leaf = await queries.findActiveLeaf(conversationId);
  if (leaf === null) throw new NoActiveLeafError(conversationId);
  return leaf;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=production/__tests__/activeLeaf`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/production/activeLeaf.ts packages/api/src/production/durableQueries.ts packages/api/src/production/__tests__/activeLeaf.test.ts
git commit -m "feat(api): active-leaf routing (resolve deepest non-sleeping execution; N-ready)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `maxDispatchDepth` → single const default 3 (N-safe)

**Files:**
- Modify: `packages/api/src/runtime/types.ts`
- Modify: `packages/backend/src/routes/execute/executeCoreInlineDispatch.ts`
- Test: `packages/api/src/runtime/__tests__/maxDispatchDepth.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `packages/api/src/runtime/types.ts` exports a single `export const MAX_DISPATCH_DEPTH = 3;` (was 10 — RU4 §9 override) and `export const DEFAULT_MAX_DISPATCH_DEPTH = MAX_DISPATCH_DEPTH;`. The production inline path (`executeCoreInlineDispatch.ts:12` `const MAX_DEPTH = 10`) is replaced by importing `MAX_DISPATCH_DEPTH`. Changing this one const changes the cap N-safely — no other code change.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/runtime/__tests__/maxDispatchDepth.test.ts
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_MAX_DISPATCH_DEPTH, MAX_DISPATCH_DEPTH } from '../types.js';

describe('maxDispatchDepth (RU4 §9)', () => {
  it('defaults to 3 (overrides the earlier 10)', () => {
    expect(MAX_DISPATCH_DEPTH).toBe(3);
    expect(DEFAULT_MAX_DISPATCH_DEPTH).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/maxDispatchDepth`
Expected: FAIL — `MAX_DISPATCH_DEPTH` is currently `10` (and `DEFAULT_MAX_DISPATCH_DEPTH` is undefined).

- [ ] **Step 3: Write minimal implementation**

In `packages/api/src/runtime/types.ts`, change the constant and add the alias:

```ts
// packages/api/src/runtime/types.ts  (replace the MAX_DISPATCH_DEPTH line)
export const MAX_DISPATCH_DEPTH = 3; // RU4 §9: single configurable cap (parent → child → grandchild). N-safe.
export const DEFAULT_MAX_DISPATCH_DEPTH = MAX_DISPATCH_DEPTH;
```

In `packages/backend/src/routes/execute/executeCoreInlineDispatch.ts`, replace the local const with the shared import:

```ts
// executeCoreInlineDispatch.ts — replace `const MAX_DEPTH = 10;`
import { MAX_DISPATCH_DEPTH } from '@daviddh/llm-graph-runner';
// ...
// and replace every `MAX_DEPTH` usage with `MAX_DISPATCH_DEPTH`
//   if (depth + INCREMENT > MAX_DISPATCH_DEPTH) {
//     throw new Error(`Max nesting depth (${String(MAX_DISPATCH_DEPTH)}) exceeded`);
//   }
```

> **FLAGGED:** the simulation default `DEFAULT_MAX_NESTING_DEPTH=10` in `backend/src/routes/simulateAgentHandler.ts` and `packages/api/src/types/agentConfig.ts` is NOT touched here — RU4 owns the *production* cap. If the user wants sim lowered to 3 too, point those at `MAX_DISPATCH_DEPTH`; this plan leaves them at 10 (sim is RU3's domain).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=runtime/__tests__/maxDispatchDepth && npm run typecheck -w packages/backend`
Expected: test PASS; backend typecheck clean (the `MAX_DEPTH` rename resolves).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/runtime/types.ts packages/backend/src/routes/execute/executeCoreInlineDispatch.ts packages/api/src/runtime/__tests__/maxDispatchDepth.test.ts
git commit -m "feat: collapse maxDispatchDepth to a single const default 3 (RU4 §9, N-safe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Node `DurableQueries` impl + durable-run driver + end-to-end multi-suspend resume test

**Files:**
- Create: `packages/backend/src/db/queries/durableQueriesImpl.ts`
- Create: `packages/backend/src/routes/execute/durableRunDriver.ts`
- Modify: `packages/api/src/production/index.ts` (barrel) + `packages/api/src/index.ts` (re-export)
- Test: `packages/backend/src/routes/execute/__tests__/durableRun.e2e.test.ts`

**Interfaces:**
- Consumes (api): `makeStepCheckpointer`, `makeSupabaseDispatchPersistence`, `makeDurableDispatchStrategy`, `triggerDirectReinvoke`, `sweepPendingResumes`, `resolveActiveLeaf`, `makeIdempotencyKey`, `MAX_DISPATCH_DEPTH`, `executeTurn`, `RuntimeCapabilities`, `RuntimeServices`, `DispatchPersistence`, `Reinvoker`, `DurableQueries` (all from `@daviddh/llm-graph-runner` after the Task 10/15-style barrel). Backend: `SupabaseClient`, `executePersistence`/`stackQueries`/`messageQueries`/`executionQueries` helpers, RU2 `createMcpPoolClient`.
- Produces:
  - `packages/backend/src/db/queries/durableQueriesImpl.ts`: `export function makeNodeDurableQueries(supabase: SupabaseClient): DurableQueries` — concrete impl of every `DurableQueries` method over the backend `supabase` client (reusing `saveExecutionMessage`/`saveExecutionMessageRaw`/`updateToolOutputMessage`/`pushStackEntry`/`popStackEntry`/`getStackTop`/`updateSessionState`, the `agent_executions.resume_marker` column, and the `pending_resumes` table + `claim_pending_resumes` RPC).
  - `packages/backend/src/routes/execute/durableRunDriver.ts`: `export async function runDurable(args: { supabase; orgId; agentId; version; input; executionId; rootExecutionId; reinvoker: Reinvoker }): Promise<{ status: 'suspended' | 'finished'; finalResult: string }>` — wires caps (`persistence: makeSupabaseDispatchPersistence(queries, rootExecutionId)`, `dispatch: makeDurableDispatchStrategy(...)`, structured logger, token-bucket/no-op rateLimit for the Node test), services (`mcpPool: createMcpPoolClient(...)`, `resolveChildConfig`, `supabase`), the step-checkpointer callbacks, and runs `executeTurn`. On a `child_suspended`/budget suspend it calls `triggerDirectReinvoke`. The Node `Reinvoker` is a **local loop driver** (re-calls `runDurable` for the next segment) so the test can drive a multi-segment run in-process without a Worker.
- The **end-to-end test** forces budget suspends (a fake `runLoop` that "suspends" after one step for the first two segments, then finishes) plus one child dispatch, and asserts: completed steps are not re-run; the tool result persisted before advance is not re-fired; each suspend wrote a `pending_resumes` row + fired the reinvoker; idempotency dedupes a double trigger; the final result is correct.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/execute/__tests__/durableRun.e2e.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import { makeNodeDurableQueries } from '../../../db/queries/durableQueriesImpl.js';
import { runDurable } from '../durableRunDriver.js';

// In-memory fake supabase capturing rows/markers + a fake pending_resumes table.
function makeFakeSupabase() {
  const steps: Array<{ executionId: string; step: number; text: string }> = [];
  const toolResults: Array<{ executionId: string; toolCallId: string }> = [];
  const markers: Record<string, unknown> = {};
  const pendingResumes: Array<{ executionId: string; idempotencyKey: string; status: string }> = [];
  // ... thin builder mimicking the .from(table).insert/update/.rpc(...) surface
  //     makeNodeDurableQueries actually uses (only the methods the test exercises).
  return { steps, toolResults, markers, pendingResumes /*, client */ } as never;
}

describe('durable multi-suspend run (4a end-to-end)', () => {
  it('checkpoints per step, resumes from the next step, never re-runs completed steps or re-fires tools', async () => {
    const fake = makeFakeSupabase();
    const queries = makeNodeDurableQueries(fake as never);
    const fired: string[] = [];
    const reinvoker = { reinvoke: jest.fn(async (a: { executionId: string }) => { fired.push(a.executionId); }) };

    // A fake loop that "budget-suspends" after segment 1 and 2, finishing on segment 3.
    const result = await runDurable({
      supabase: fake as never, orgId: 'o', agentId: 'a', version: 1,
      input: { tenantId: 't', userId: 'u', sessionId: 's', channel: 'web', message: { text: 'go' } } as never,
      executionId: 'exec-1', rootExecutionId: 'exec-1', reinvoker: reinvoker as never,
      // test-only seam: inject a scripted runLoop (see Step 3 note).
      __scriptedSegments: [{ suspend: true }, { suspend: true }, { finishText: 'all done' }],
    } as never);

    expect(result.status).toBe('finished');
    expect(result.finalResult).toBe('all done');
    expect(fired.length).toBeGreaterThanOrEqual(2); // two budget suspends → two re-invokes
  });

  it('dedupes a double trigger via the idempotency key (one effective run)', async () => {
    const fake = makeFakeSupabase();
    const queries = makeNodeDurableQueries(fake as never);
    const applied = await queries.resumeAlreadyApplied('budget:exec-1:step-1');
    expect(applied).toBe(false); // first time → proceeds
  });
});
```

> Test-only seam: `runDurable` accepts an optional `__scriptedSegments` to inject a scripted `runLoop`/`runChildLoop` so the e2e test never calls a real model. Keep the seam test-only and typed (no `any` in production paths). The fake supabase only implements the `.from(...)`/`.rpc(...)` surface the queries actually touch.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=durableRun.e2e`
Expected: FAIL — cannot find `../durableRunDriver.js` / `durableQueriesImpl.js`.

- [ ] **Step 3: Write minimal implementation**

Create `makeNodeDurableQueries(supabase)` implementing every `DurableQueries` method:
- `writeStepOutput` → `saveExecutionMessage` (assistant text) + `saveNodeVisit` (tokens/duration) on `executionId`.
- `writeToolResult` → `saveExecutionMessageRaw` with the tool-result content (the `__CHILD_PENDING__`-style placeholder for dispatches, or the real tool output otherwise).
- `advanceResumeMarker` → `update agent_executions set resume_marker = :marker where id = :executionId`.
- `pushDispatch` → `pushStackEntry(...)` writing `parent_session_state`, `agent_config`, `root_execution_id` (mirrors today's `pushStackForInlineDispatch`) + set parent `agent_executions.status='suspended'`.
- `writeChildOutcome` → `updateToolOutputMessage` of the parent placeholder with the child result (mirrors `updatePlaceholderMessage`).
- `enqueueResume` → `insert into pending_resumes (execution_id, reason, idempotency_key) values (...) on conflict (idempotency_key) do nothing`.
- `resumeAlreadyApplied` → `select 1 from pending_resumes where idempotency_key = :k and status = 'completed'` (true if already completed).
- `claimPendingResumes` → `rpc('claim_pending_resumes', { p_limit: limit, p_stale_seconds: staleSeconds })` mapped to `{ executionId, idempotencyKey }`.
- `findActiveLeaf` → `getStackTop`-based query resolving the deepest non-sleeping execution under the conversation's root.
- `listPendingDispatches` → select stack entries whose parent is `executionId` and whose child has not finished → `[{ executionId, childExecutionId }]`.

Create `runDurable(args)` wiring `executeTurn` with the durable caps + `makeStepCheckpointer` callbacks + `triggerDirectReinvoke` on suspend + the local-loop `Reinvoker` for the Node e2e. Decompose into helpers (`buildDurableCapabilities`, `buildDurableServices`, `buildPrepareChild`, `driveSegment`) to respect `max-lines`/`max-lines-per-function`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=durableRun.e2e && npm run typecheck -w packages/backend`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/durableQueriesImpl.ts packages/backend/src/routes/execute/durableRunDriver.ts packages/api/src/production/index.ts packages/api/src/index.ts packages/backend/src/routes/execute/__tests__/durableRun.e2e.test.ts
git commit -m "feat(backend): Node DurableQueries impl + durable-run driver + multi-suspend resume e2e (4a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4b — Cloudflare host cutover

### Task 10: `packages/worker` scaffold + `wrangler.toml` + `workerSupabase` (Hyperdrive)

**Files:**
- Create: `packages/worker/package.json`
- Create: `packages/worker/tsconfig.json`
- Create: `packages/worker/wrangler.toml`
- Create: `packages/worker/src/workerSupabase.ts`
- Test: `packages/worker/src/__tests__/workerSupabase.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js` `createClient`; a Cloudflare `Env` with a Hyperdrive binding.
- Produces:
  - `packages/worker/src/workerSupabase.ts`: `export interface WorkerEnv { HYPERDRIVE: { connectionString: string }; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; EDGE_FUNCTION_MASTER_KEY: string; MCP_BASE_URL: string; WORKER_SELF_URL: string }` and `export function makeWorkerSupabase(env: WorkerEnv): SupabaseClient` — service-role client. **ASSUMPTION (verify on a real deploy):** supabase-js over the Hyperdrive `connectionString` (Hyperdrive fronts Postgres for stateless Workers). If supabase-js PostgREST cannot ride Hyperdrive directly, fall back to the Supabase pooler URL via `SUPABASE_URL` + service-role key; the durable writes need the service-role path. **FLAGGED — confirm Hyperdrive vs pooler against the real deploy (spec §15).**
  - `wrangler.toml` with the Hyperdrive binding, secrets (master key, MCP base URL), `[triggers] crons` (Task 12), and limits.

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/__tests__/workerSupabase.test.ts
import { describe, expect, it } from '@jest/globals';

import { makeWorkerSupabase, type WorkerEnv } from '../workerSupabase.js';

describe('makeWorkerSupabase', () => {
  it('builds a client from a Workers env', () => {
    const env: WorkerEnv = {
      HYPERDRIVE: { connectionString: 'postgres://x' },
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      EDGE_FUNCTION_MASTER_KEY: 'mk',
      MCP_BASE_URL: 'https://be.example.com',
      WORKER_SELF_URL: 'https://worker.example.com',
    };
    const client = makeWorkerSupabase(env);
    expect(typeof client.from).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/worker -- --testPathPattern=workerSupabase`
Expected: FAIL — package/module does not exist (workspace `packages/worker` missing).

- [ ] **Step 3: Write minimal implementation**

Create `packages/worker/package.json` (ESM, type module, deps: `@supabase/supabase-js`, `@daviddh/llm-graph-runner`, the RU1 store-services package — name per finding #7, devDeps: `wrangler`, `@cloudflare/workers-types`, `miniflare`, jest). Add `packages/worker` to the root workspace `packages/*` glob if not already covered. Create `tsconfig.json` extending the repo base with `@cloudflare/workers-types`.

```toml
# packages/worker/wrangler.toml
name = "llm-graph-worker"
main = "src/index.ts"
compatibility_date = "2026-06-25"
compatibility_flags = ["nodejs_compat"]

# Hyperdrive in front of Postgres so stateless Workers don't exhaust connections (spec §10.4).
# ASSUMPTION: id is filled from `wrangler hyperdrive create`. FLAGGED — set on real deploy.
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<hyperdrive-id>"

# Cron BACKSTOP ONLY (spec §5) — sanity sweep for dropped direct re-invokes. NOT the main path.
[triggers]
crons = ["* * * * *"]

[vars]
MCP_BASE_URL = "https://backend.example.com"

# Secrets (set via `wrangler secret put`): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# EDGE_FUNCTION_MASTER_KEY, WORKER_SELF_URL
```

```ts
// packages/worker/src/workerSupabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface WorkerEnv {
  HYPERDRIVE: { connectionString: string };
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EDGE_FUNCTION_MASTER_KEY: string;
  MCP_BASE_URL: string;
  WORKER_SELF_URL: string;
}

// ASSUMPTION (spec §15): supabase-js service-role over the Supabase URL; Hyperdrive
// fronts the direct Postgres connections the pooled writes use. Confirm Hyperdrive
// vs Supabase pooler against the real deploy before cutover.
export function makeWorkerSupabase(env: WorkerEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/worker -- --testPathPattern=workerSupabase`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/worker/package.json packages/worker/tsconfig.json packages/worker/wrangler.toml packages/worker/src/workerSupabase.ts packages/worker/src/__tests__/workerSupabase.test.ts
git commit -m "feat(worker): scaffold packages/worker + wrangler.toml (Hyperdrive) + workerSupabase

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Worker `fetch` handler (new run / human resume / direct re-invoke) running `executeTurn` with durable caps

**Files:**
- Create: `packages/worker/src/workerDurableQueries.ts`
- Create: `packages/worker/src/runDurable.ts`
- Create: `packages/worker/src/index.ts`
- Test: `packages/worker/src/__tests__/fetchHandler.test.ts`

**Interfaces:**
- Consumes: `makeWorkerSupabase` (Task 10); api durable impls + `executeTurn` (Tasks 2–9); RU2 `createMcpPoolClient`.
- Produces:
  - `packages/worker/src/workerDurableQueries.ts`: `export function makeWorkerDurableQueries(supabase): DurableQueries` (same surface as the Node impl, over `workerSupabase`; may be a thin re-use if the Node impl is client-agnostic — prefer sharing the impl from `packages/api` with the client injected).
  - `packages/worker/src/runDurable.ts`: `export async function runDurableOnWorker(args: { env: WorkerEnv; ctx: ExecutionContext; request: DurableRunRequest }): Promise<Response>` — wires caps + services + a `fetch(self)` `Reinvoker` (`ctx.waitUntil(fetch(env.WORKER_SELF_URL, { method:'POST', body: { mode:'reinvoke', executionId, idempotencyKey } }))`) and runs `executeTurn`.
  - `packages/worker/src/index.ts`: `export default { async fetch(request, env, ctx): Promise<Response>, async scheduled(event, env, ctx): Promise<void> }` — `fetch` discriminates the body `mode`: `new_run` (mint executionId + run), `human_resume` (resolve active leaf via `resolveActiveLeaf`, continue that `executionId`), `reinvoke` (idempotency-check then continue the same execution). `scheduled` is Task 12.
  - `DurableRunRequest` discriminated union: `{ mode:'new_run'; orgId; agentId; version; input } | { mode:'human_resume'; conversationId; message } | { mode:'reinvoke'; executionId; idempotencyKey }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/__tests__/fetchHandler.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import worker from '../index.js';

function fakeEnv() {
  return {
    HYPERDRIVE: { connectionString: 'postgres://x' },
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's',
    EDGE_FUNCTION_MASTER_KEY: 'm', MCP_BASE_URL: 'https://be', WORKER_SELF_URL: 'https://w',
  } as never;
}

describe('worker fetch handler', () => {
  it('rejects an unknown mode with 400', async () => {
    const ctx = { waitUntil: jest.fn() } as never;
    const req = new Request('https://w', { method: 'POST', body: JSON.stringify({ mode: 'nonsense' }) });
    const res = await worker.fetch(req, fakeEnv(), ctx);
    expect(res.status).toBe(400);
  });
});
```

> The happy-path runs are covered by the 4a e2e (Task 9, real durable logic in Node) and the Miniflare smoke (Task 14); this test only asserts the handler's dispatch/validation surface without a live DB.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/worker -- --testPathPattern=fetchHandler`
Expected: FAIL — cannot find module `../index.js`.

- [ ] **Step 3: Write minimal implementation**

Implement `workerDurableQueries.ts`, `runDurable.ts`, and `index.ts` per the interfaces. Keep `index.ts` thin (parse body → discriminate `mode` → delegate), decomposed into `handleNewRun`/`handleHumanResume`/`handleReinvoke` helpers to respect `max-lines-per-function`. The `Reinvoker` uses `ctx.waitUntil(fetch(env.WORKER_SELF_URL, ...))`. **ASSUMPTION (spec §15): confirm CF allows a Worker self-`fetch` via `waitUntil` within limits; the cron backstop (Task 12) covers any dropped fire. FLAGGED.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/worker -- --testPathPattern=fetchHandler && npm run typecheck -w packages/worker`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/workerDurableQueries.ts packages/worker/src/runDurable.ts packages/worker/src/index.ts packages/worker/src/__tests__/fetchHandler.test.ts
git commit -m "feat(worker): fetch handler (new run / human resume / direct re-invoke) over executeTurn

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `scheduled()` cron-backstop handler

**Files:**
- Modify: `packages/worker/src/index.ts` (`scheduled` handler)
- Test: `packages/worker/src/__tests__/scheduled.test.ts`

**Interfaces:**
- Consumes: `sweepPendingResumes` + `SWEEP_STALE_SECONDS` (Task 6); `makeWorkerDurableQueries`; the `fetch(self)` `Reinvoker`.
- Produces: `scheduled(event, env, ctx)` calls `sweepPendingResumes({ queries, reinvoker })` inside `ctx.waitUntil(...)`. **The handler + its comment MUST state it is the BACKSTOP ONLY (dropped-trigger fallback / sanity sweep), never the primary path** — mirroring `cronSweep.ts`'s header.

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/__tests__/scheduled.test.ts
import { describe, expect, it, jest } from '@jest/globals';

import worker from '../index.js';

describe('worker scheduled (cron BACKSTOP)', () => {
  it('runs the sweep inside waitUntil', async () => {
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as never;
    const env = {
      HYPERDRIVE: { connectionString: 'postgres://x' },
      SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's',
      EDGE_FUNCTION_MASTER_KEY: 'm', MCP_BASE_URL: 'https://be', WORKER_SELF_URL: 'https://w',
    } as never;
    await worker.scheduled({ cron: '* * * * *', scheduledTime: Date.now() } as never, env, ctx);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/worker -- --testPathPattern=scheduled`
Expected: FAIL — `scheduled` not yet exported / does not call `waitUntil`.

- [ ] **Step 3: Write minimal implementation**

Add to `index.ts`'s default export:

```ts
  // BACKSTOP ONLY (spec §5) — dropped-trigger fallback / sanity sweep. NEVER the
  // primary resume path (that is the direct self-re-invoke in fetch). Staleness-gated.
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    const supabase = makeWorkerSupabase(env);
    const queries = makeWorkerDurableQueries(supabase);
    const reinvoker = makeSelfReinvoker(env, ctx);
    ctx.waitUntil(sweepPendingResumes({ queries, reinvoker }));
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/worker -- --testPathPattern=scheduled && npm run typecheck -w packages/worker`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/index.ts packages/worker/src/__tests__/scheduled.test.ts
git commit -m "feat(worker): scheduled() cron BACKSTOP handler (staleness-gated sweep, labelled fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Fold in `execute-tool` single-tool execution (Play button)

**Files:**
- Create: `packages/worker/src/singleTool.ts`
- Modify: `packages/worker/src/index.ts` (`mode: 'single_tool'`)
- Test: `packages/worker/src/__tests__/singleTool.test.ts`

**Interfaces:**
- Consumes: the RU3 tool-building pipeline (`buildToolsForAgentV2`/registry from `packages/api`), `createMcpPoolClient`.
- Produces: `packages/worker/src/singleTool.ts`: `export async function runSingleTool(args: { env: WorkerEnv; payload: SingleToolPayload }): Promise<{ ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }>` — mirrors the former `supabase/functions/execute-tool/index.ts`: builds tools, picks `(providerId, toolName)`, runs `tool.execute(args, { toolCallId:'test', messages:[] })`, returns the `ExecOk`/`ExecErr` shape. The `fetch` handler routes `mode:'single_tool'` here.

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/__tests__/singleTool.test.ts
import { describe, expect, it } from '@jest/globals';

import { runSingleTool } from '../singleTool.js';

describe('runSingleTool', () => {
  it('returns an ExecErr for an unknown tool', async () => {
    const env = {
      HYPERDRIVE: { connectionString: 'postgres://x' },
      SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's',
      EDGE_FUNCTION_MASTER_KEY: 'm', MCP_BASE_URL: 'https://be', WORKER_SELF_URL: 'https://w',
    } as never;
    const out = await runSingleTool({
      env,
      payload: { providerId: 'kv_store', toolName: 'does_not_exist', args: {}, agent: { graph: { nodes: [], edges: [] } } } as never,
    });
    expect(out.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/worker -- --testPathPattern=singleTool`
Expected: FAIL — cannot find module `../singleTool.js`.

- [ ] **Step 3: Write minimal implementation**

Port the `execute-tool` body into `runSingleTool` using the shared `packages/api` tool pipeline (no Deno-side duplicates — spec §11.5). Route `mode:'single_tool'` in `index.ts`. Decompose into `buildSingleToolDeps`/`pickTool`/`executePicked` helpers for the line limits.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/worker -- --testPathPattern=singleTool && npm run typecheck -w packages/worker`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/singleTool.ts packages/worker/src/index.ts packages/worker/src/__tests__/singleTool.test.ts
git commit -m "feat(worker): fold in execute-tool single-tool execution (Play button)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Workers-compat smoke (core + RU1 import/run clean, Miniflare)

**Files:**
- Create: `packages/worker/src/__tests__/workersCompat.smoke.test.ts`
- Create: `packages/worker/vitest.config.ts` OR jest+miniflare config (whichever the repo's Workers test harness uses; document choice)
- Test: the smoke file itself.

**Interfaces:**
- Consumes: `@daviddh/llm-graph-runner` (RU3 core: `executeTurn`, durable impls), the RU1 store-services package, Miniflare.
- Produces: a Miniflare-hosted run that **imports** the RU3 core + RU1 factories and **executes** a trivial `executeTurn` segment on the Workers runtime — proving no stray Node API (`Buffer`, Node `crypto`, `process`) surfaces (spec §15 risk). This is 4b's first proof of the compatibility 4a asserted.

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/__tests__/workersCompat.smoke.test.ts
import { describe, expect, it } from '@jest/globals';

// Imported INSIDE the Workers runtime (Miniflare) — a stray Node API throws on import.
import { executeTurn, MAX_DISPATCH_DEPTH } from '@daviddh/llm-graph-runner';

describe('Workers compatibility smoke', () => {
  it('imports the RU3 core clean and runs a trivial turn', async () => {
    expect(MAX_DISPATCH_DEPTH).toBe(3);
    const out = await executeTurn({
      environment: 'production', dispatchDepth: 0, maxDispatchDepth: MAX_DISPATCH_DEPTH,
      capabilities: {} as never, services: {} as never,
      runLoop: async () => ({ finalText: 'ok', steps: 1, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [] }),
      runChildLoop: async () => ({ finalText: '', steps: 0, totalTokens: { input: 0, output: 0, cached: 0 }, tokensLogs: [], toolCalls: [] }),
    });
    expect(out.finalResult).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/worker -- --testPathPattern=workersCompat.smoke` (under the Miniflare/Workers test runner)
Expected: FAIL initially — either the Workers test harness isn't wired, or (the real signal) a Node-only API surfaces on import inside the Workers runtime.

- [ ] **Step 3: Make it pass**

Wire the Workers test runner (Miniflare). If a stray Node API surfaces (`Buffer`/`process`/Node `crypto`), fix it at the source in `packages/api` / `packages/shared-store-services` (Web Crypto, `re2js` not native `re2` — already asserted by RU1; this task is where it's *proven*). **FLAGGED:** any compat fix here is a real change to the shared packages — keep it minimal and note it. If compat surprises balloon, 4a still stands alone (durability proven in Node, spec §15).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/worker -- --testPathPattern=workersCompat.smoke`
Expected: PASS (RU3 core + RU1 import and run clean on the Workers runtime).

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/__tests__/workersCompat.smoke.test.ts packages/worker/vitest.config.ts
git commit -m "test(worker): Workers-compat smoke (RU3 core + RU1 import/run clean on Miniflare)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Flip `edgeFunctionClient` → Worker

**Files:**
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`
- Test: `packages/backend/src/routes/execute/__tests__/edgeFunctionClient.url.test.ts`

**Interfaces:**
- Consumes: a `WORKER_URL` env var (new) replacing `SUPABASE_EDGE_FUNCTION_URL` as the execute target.
- Produces: `executeAgent(...)` POSTs to the Worker URL (the `new_run` / resume `mode` body shape from Task 11) instead of `${SUPABASE_EDGE_FUNCTION_URL}/execute-agent`. The Worker is now the production execution host. **The edge `execute-agent`/`execute-tool` Deno code is LEFT IN PLACE — deletion is RU6** (spec §10).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/execute/__tests__/edgeFunctionClient.url.test.ts
import { describe, expect, it, jest } from '@jest/globals';

describe('edgeFunctionClient targets the Worker', () => {
  it('POSTs to WORKER_URL, not the Supabase edge', async () => {
    process.env.WORKER_URL = 'https://worker.example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    process.env.EDGE_FUNCTION_MASTER_KEY = 'mk';
    const calls: string[] = [];
    const fakeFetch = jest.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, body: new ReadableStream(), status: 200 } as never;
    });
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch as never;
    const { executeAgent } = await import('../edgeFunctionClient.js');
    await executeAgent({} as never, { onNodeVisited() {}, onNodeProcessed() {} }).catch(() => undefined);
    expect(calls.some((u) => u.startsWith('https://worker.example.com'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=edgeFunctionClient.url`
Expected: FAIL — still posts to `${SUPABASE_EDGE_FUNCTION_URL}/execute-agent`.

- [ ] **Step 3: Write minimal implementation**

In `edgeFunctionClient.ts`, replace `getRequiredEnv('SUPABASE_EDGE_FUNCTION_URL')` + the `/execute-agent` path with `getRequiredEnv('WORKER_URL')` and the Worker's `new_run`/resume body shape; keep the SSE stream reader unchanged (the Worker emits the same SSE vocabulary the backend already parses, or — if RU5 hasn't landed — the Worker emits the legacy edge SSE shape the existing parser expects). **FLAGGED:** the Worker must emit the SSE shape `processEventStream` consumes until RU5's vocabulary cutover; confirm the Worker's `runDurable` streaming matches `handleSseEvent`'s expected event types (`node_visited`/`step_processed`/`agent_response`/`error`). If they diverge, the Worker emits the legacy shape for now (RU5 unifies).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=edgeFunctionClient.url && npm run typecheck -w packages/backend`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/edgeFunctionClient.ts packages/backend/src/routes/execute/__tests__/edgeFunctionClient.url.test.ts
git commit -m "feat(backend): flip edgeFunctionClient from Supabase edge to the Cloudflare Worker (edge left in place for RU6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Full gate + Cloudflare-assumption verification checklist

**Files:** none (verification only).

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: format clean, lint clean (no `eslint-disable`, no `any`), `tsc -b` clean across all packages (incl. `packages/worker`).

- [ ] **Step 2: Run all touched suites**

Run: `npm run test -w packages/api -- --testPathPattern=production && npm run test -w packages/backend -- --testPathPattern="durableRun|pendingResumesShape|edgeFunctionClient" && npm run test -w packages/worker`
Expected: all green.

- [ ] **Step 3: Verify the deferred-but-not-precluded structural choices hold**

Confirm (read-only): `listPending` returns a collection (Task 3); executions are addressed by `execution_id` (no "stack top" in the durable path — Task 7); the "input source" concept is named in `activeLeaf.ts`'s comment (Task 7). None of concurrent-child / N-children is implemented.

- [ ] **Step 4: Cloudflare-assumption verification (manual, against a real deploy — spec §15)**

Record results in the PR description (these cannot be unit-asserted from the repo):
- Hyperdrive vs Supabase pooler fronts the service-role write path (Task 10 ASSUMPTION).
- Worker self-`fetch` via `ctx.waitUntil` is allowed within CF limits (Task 11 ASSUMPTION).
- `maxChildRuntimeMs` "active execution time" accumulates across invocations (persisted), not per-invocation (spec §15) — confirm the resume_marker/queries persist accumulated active ms; if not yet wired, FLAG as a follow-up before the user's end-to-end gate.
- The user's pre-merge end-to-end gate exercises a real durable suspend/resume across Worker invocations (spec §13).

- [ ] **Step 5: Commit any fixups**

```bash
git add -p
git commit -m "chore: RU4 full-gate formatting/lint fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (spec section → task)

| Spec section | Task(s) |
|---|---|
| §1 Intent: durable per-step step-machine across many invocations | 2, 4, 5, 9, 11 |
| §2 In (4a): per-step checkpoint; suspend reasons; resume triggers; DurableDispatchStrategy + persistence; pending_resumes + claim RPC; idempotency; maxDispatchDepth 3 | 1–9 |
| §2 In (4b): packages/worker; wrangler; Hyperdrive; fold in execute-tool; flip edgeFunctionClient; Workers-compat verify | 10–15 |
| §2 Out: concurrent-child / N children deferred, accommodated | 3 (`listPending` collection), 7 (`execution_id` addressing + input-source comment), 16 (step 3) |
| §3 step = resumable checkpoint; tool-result-persisted-before-advance | 2 |
| §3 suspend reasons (budget/input/dispatch) → resume triggers | 3 (dispatch), 5 (budget direct re-invoke), 11 (input/human resume) |
| §4 execution tree + active-leaf routing (execution_id addressed, N-depth safe) | 7 |
| §5 direct re-invoke PRIMARY + cron sweep BACKSTOP (staleness-gated, labelled) | 5 (primary), 6 + 12 (backstop) |
| §6 execution persistence (per-step + dispatch ops + listPending collection; pending_resumes + claim RPC) | 1, 2, 3 |
| §7 DurableDispatchStrategy (suspend → `{kind:'suspended'}`, shared child-injection) | 4, 9 |
| §8 idempotency keys (checked before continuing) | 5, 9 |
| §9 maxDispatchDepth single const default 3, N-safe | 8 |
| §10 the Cloudflare Worker (index/workerSupabase/runDurable/singleTool, wrangler, Hyperdrive, MCP via RU2 pool, edge left in place) | 10–13, 15 |
| §11 phasing (4a Node; 4b host) | Phase 4a (1–9) / Phase 4b (10–16) |
| §12 future-proofing (listPending collection, execution_id addressing, input-source concept) | 3, 7 |
| §13 tests (per-step+resume-from-next; suspend→trigger; direct re-invoke; sweep claims only stale; idempotency dedupe; tool-before-advance; DurableDispatchStrategy parity; active-leaf; depth cap; multi-invoke run) | 2, 4, 5, 6, 7, 8, 9; 4b smoke 14 |
| §14 affected paths (api durable impls, migrations, edited core/edgeFunctionClient) | 1, 2, 8, 9, 15 |
| §15 risks (per-step write volume; Workers compat; self-fetch limits; Hyperdrive vs pooler; maxChildRuntimeMs accumulation) | 14, 16 (verification), flagged in 10/11 |

**Out of scope (correctly deferred, per spec §2/§12):** concurrent-child / N concurrent children (stages 2–3 — only the structural seams ship: `listPending` collection, `execution_id` addressing, named "input source"); the SSE consumer cutover (RU5); deleting the edge `execute-agent`/`execute-tool` Deno runtime (RU6).

**Spec requirements I could NOT cleanly map to a task (flagged, not silently fixed):**

1. **`maxChildRuntimeMs` active-time accumulation — RESOLVED (user decision): persist now, per-execution.** Task 2's migration adds `agent_executions.accumulated_active_ms bigint default 0` (keyed by `execution_id`). Each invocation increments it on suspend/checkpoint; resume checks it and terminates *that* execution with `ChildResult timeout` if `>= maxChildRuntimeMs`. **Per-execution, not shared** — 5 siblings each get their own 1h. (See the accumulator-wiring note under Task 2's migration.)

2. **Cloudflare Queues alternative** (north-star §10.4 mentions "Cloudflare Queues … or a cron sweep"). RU4's spec §5 chose **direct self-re-invoke + cron backstop** and does not mention Queues, so no task implements Queues. Mapped to the chosen mechanism only; flagging that the north-star's Queues option is deliberately not taken.

**Places the spec contradicts the code (FLAGGED, implemented against reality):**

1. **`pending_resumes` column set.** Spec §6 asks for `(execution_id, reason, idempotency_key, status, last_attempt_at, created_at)`, but the *dropped* table had `(session_id, parent_execution_id, parent_tool_output_message_id, child_output, child_status, parent_session_state, status, attempts, last_attempt_at, created_at, root_execution_id)`. These are materially different. Built to the spec's adapted shape (Task 1, finding #1) — `child_output`/`child_status`/`parent_tool_output_message_id` intentionally NOT restored.

2. **Inline dispatch recurses in-process today; the durable model must END the invocation.** `executeCoreInlineDispatch.ts:210` calls `executeAgentCore(childInput)` inline (sync recursion-ish), even though it also writes the suspend state. The spec's durable model requires the invocation to end after `beforeDispatch` and resume via a separate trigger. `DurableDispatchStrategy` (Task 4) returns `{ kind:'suspended' }` and never runs the child — this is a behavioral change from the existing inline path (finding #3).

3. **Persistence is at execution boundaries, not per-step.** `persistPostExecution`/`persistMessagingPostExecution` run once at the end; the loop fires per-step callbacks only for streaming. RU4 moves persistence into the callbacks (Task 2, finding #4) — a relocation of where the DB write happens.

4. **`maxDispatchDepth` lives in 4 places at value 10.** Spec §9 wants ONE const at 3. Consolidated to `packages/api/src/runtime/types.ts` and the prod inline path repointed (Task 8); the *simulation* default (`DEFAULT_MAX_NESTING_DEPTH=10`) is deliberately left untouched as out-of-scope for RU4 (finding #5) — flag if the user wants it unified.

5. **RU3 `DispatchPersistence` shape ambiguity.** Built to the four-method `beforeDispatch`/`onChildFinish`/`onChildError`/`listPending` contract (RU3 Task 4 text + RU4 §6/§10.1). A parallel read of the RU3 plan surfaced a `persist`/`resume` two-method variant with a richer `DispatchHandle`; if RU3 actually shipped that, reconcile before Task 3 (finding #6).

6. **Cross-RU name drift:** RU1 package is `@openflow/shared-store-services` (RU1 plan/agent) vs `@daviddh/shared-store-services` (RU3 plan). Use the real published name at impl time (finding #7).
