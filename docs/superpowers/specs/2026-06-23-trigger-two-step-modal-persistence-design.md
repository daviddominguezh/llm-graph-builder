# Triggers: two-step modal, persistence, and a firing scheduler

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## Problem

The Triggers tab in the agent/workflow editor builds a schedule (recurring /
once / after-event) but: (1) it never captures the **initial message** the
agent should receive; (2) triggers live only in client memory and never reach
the backend; (3) nothing ever **fires** them — the FE shows "next runs" but no
agent is invoked at those times.

We will: add a two-step modal (schedule → message), persist triggers through the
established Client → Next.js server action → dedicated backend
(`packages/backend`) flow, and add a backend scheduler that fires due triggers
by invoking the agent through the same edge-function executor production uses.

## Repository reality (corrected)

The dedicated backend **is** in this repo: `packages/backend` (Express,
`NEXT_PUBLIC_API_URL` :4000). Relevant packages: `web` (Next.js), `backend`
(Express + workers), `api`/`graph-types`/`shared-validation` (libraries),
`supabase/` (migrations + edge functions, incl. `execute-agent`).

## Scope (single change)

- **Read + Write + Delete** of triggers (no update/patch). Editing is **dropped**
  — rows are delete-only; changing a schedule = delete + re-create.
- Triggers are scoped to **agent + tenant**.
- A backend **poll-worker** fires due triggers, with a **per-run lock** safe
  across multiple BE instances, a **fresh session id per run**, and a
  **configurable default user id**.
- Firing reuses the production executor (`execute-agent` edge function via
  `executeAgentCore`). The agent's **published production version** is run.

Out of scope: after-event triggers (still "coming soon"); a management UI for
run history; retries/backoff beyond what is stated under Resilience.

## Component map

```
FE (web)                         Backend (packages/backend)        Shared / DB
─────────                        ──────────────────────────       ───────────
TriggerFormDialog (2 steps)      agentRouter + trigger handlers    shared-validation:
useTriggers (async CRUD)   ───▶  triggerQueries (db)         ───▶    triggers/schedule.ts
actions/triggers.ts (proxy)      triggerWorker (poll loop)           (types + computeNextRun)
lib/triggers.ts                  → executeAgentCore → execute-agent
nextRun.ts (re-export shared)    claim_due_triggers RPC            migrations:
                                                                     agent_triggers, trigger_runs
```

## 1. Shared schedule logic (single source of truth)

Move the pure recurrence math out of the web package into
`@openflow/shared-validation` so the FE preview and the backend scheduler use
identical logic (no drift between "next runs" shown and when firing happens).

- New module `packages/shared-validation/src/triggers/schedule.ts` containing:
  the schedule **types** (`ScheduleMode`, `RecurringUnit`, `Weekday`,
  `RecurringConfig`, and the schedule portion of `TriggerFormState`), plus
  `computeNextRun(state, now)` and `computePreviewRuns(...)` (ported verbatim
  from `packages/web/app/components/agents/triggers/nextRun.ts`).
- Add `dayjs` to `shared-validation` dependencies; export the module via
  `package.json` `exports` (`"./triggers/schedule"`).
- `packages/web/app/components/agents/triggers/types.ts` and `nextRun.ts`
  **re-export** from the shared module (keeps existing web imports working).
- `initialMessage: string` is added to `TriggerFormState` (web-side form type);
  it is **not** part of the schedule math, so it stays in the web type that
  extends the shared schedule type. `DEFAULT_TRIGGER_STATE.initialMessage = ''`.

## 2. UI — two-step modal

`packages/web/app/components/agents/triggers/TriggerFormDialog.tsx`.
`FormBody` gains `step: 'schedule' | 'message'`.

- **Step 1 — Schedule.** Today's content. Footer: `Cancel` · **`Next`** (always
  enabled — schedule has valid defaults).
- **Step 2 — Message.** A labeled shadcn `Textarea` bound to
  `state.initialMessage`. Footer: **`Back`** (preserves all state) · **`Create`**,
  where `Create` is **disabled while `state.initialMessage.trim() === ''`**.
  `Create` → `onSave(state)` then close.

To respect ESLint limits (40 lines/fn, 300/file, depth 2): extract
`ScheduleStep.tsx` (current schedule body) and `MessageStep.tsx`; a small
`StepFooter` renders the two footer variants. Dialog keeps its fixed height.

## 3. Persistence (web → backend)

### Web
- `app/lib/triggers.ts` — `TriggerRow` type + guards + `toTrigger` mapper +
  `fetchFromBackend` calls; returns `{ result, error }`.
- `app/actions/triggers.ts` — `'use server'` wrappers with `serverLog`/
  `serverError` (mirrors `actions/tenants.ts`):
  `listTriggersAction(agentId, tenantId)`,
  `createTriggerAction(agentId, tenantId, form)`,
  `deleteTriggerAction(agentId, triggerId)`.

### Backend (`packages/backend`)
Add to `routes/agents/agentRouter.ts` (after `requireAuth`), with Zod-validated
bodies and a `db/queries/triggerQueries.ts` module:
- `GET    /agents/:agentId/triggers?tenantId=:tenantId` → `TriggerRow[]`
- `POST   /agents/:agentId/triggers` → `TriggerRow`
  - body: `{ tenantId, mode, recurring, onceDateTime, initialMessage }` (explicit
    flat fields; `recurring` is a nested object)
  - handler computes `next_run_at` via the shared `computeNextRun` and inserts.
- `DELETE /agents/:agentId/triggers/:triggerId` → `{ }` / 204

`TriggerRow` (snake_case, returned to web; `toTrigger` maps to the FE shape):
`{ id, agent_id, tenant_id, org_id, mode, recurring, once_datetime,
initial_message, next_run_at, last_run_at, enabled, created_at }`.

## 4. Database (migration files only; user applies)

New migration under `supabase/migrations/`:

**`agent_triggers`**
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| agent_id | uuid | FK agents |
| tenant_id | uuid | FK tenants |
| org_id | uuid | denormalized for scoping/RLS |
| mode | text | `recurring` / `once` / `after-event` |
| recurring | jsonb | nullable (RecurringConfig) |
| once_datetime | timestamptz | nullable |
| initial_message | text | not null |
| next_run_at | timestamptz | nullable — null = unscheduled/claimed/done |
| last_run_at | timestamptz | nullable |
| enabled | boolean | not null default true |
| created_at | timestamptz | default now() |

Index `(enabled, next_run_at)` for the due query. RLS follows existing table
conventions; the worker uses the service client (like `ragWorker`), web CRUD
goes through the authenticated backend routes.

**`trigger_runs`** (audit + per-occurrence idempotency)
`id uuid pk`, `trigger_id uuid FK`, `scheduled_for timestamptz not null`,
`session_id text not null`, `status text` (`running`/`succeeded`/`failed`),
`error text`, `started_at timestamptz default now()`, `finished_at timestamptz`.
**`UNIQUE(trigger_id, scheduled_for)`**.

**`claim_due_triggers(p_limit int)` RPC** — the per-run lock, mirroring the
existing `claim_pending_*` `FOR UPDATE SKIP LOCKED` pattern, capturing the old
`next_run_at` as `scheduled_for` and nulling it atomically so no other instance
or later tick can re-pick the same occurrence:
```sql
WITH due AS (
  SELECT id, next_run_at AS scheduled_for
  FROM agent_triggers
  WHERE enabled AND next_run_at IS NOT NULL AND next_run_at <= now()
  ORDER BY next_run_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED
)
UPDATE agent_triggers t SET next_run_at = NULL
FROM due WHERE t.id = due.id
RETURNING t.*, due.scheduled_for;
```

## 5. Backend scheduler (poll-worker)

`packages/backend/src/workers/triggerWorker.ts` (+ a `triggerWorkerLoop.ts` for
the tick logic), mirroring `workers/ragWorker.ts`:

- `startTriggerWorker()` is invoked in `packages/backend/src/index.ts` (next to
  `startRagWorker()`); uses `createServiceClient`. `POLL_INTERVAL_MS` ~ 15000.
- `tickOnce(supabase)`:
  1. `claim_due_triggers(BATCH_LIMIT)` → claimed rows (each with `scheduled_for`).
  2. For each (sequential `reduce`, like `ragWorker`):
     - `INSERT INTO trigger_runs(trigger_id, scheduled_for, session_id, status)
       VALUES (…, 'running') ON CONFLICT (trigger_id, scheduled_for) DO NOTHING`.
       If no row inserted → skip (already handled). `session_id =
       crypto.randomUUID()`.
     - Resolve the agent's **published production version** (same resolution
       production uses) and `orgId` from the agent row.
     - `executeAgentCore({ supabase, orgId, agentId, version, input })` with
       `input = { tenantId, userId: TRIGGER_DEFAULT_USER_ID, sessionId,
       message: { text: initial_message }, channel: 'api', stream: false }`.
     - Mark the `trigger_runs` row `succeeded`/`failed`(+error).
  3. In a `finally` per trigger: set `last_run_at = now()` and recompute
     `next_run_at` via shared `computeNextRun` from `scheduled_for` — recurring
     and still before `endAt` → next occurrence; `once`/expired → leave `null`
     (effectively complete). Advancing in `finally` ensures an execution error
     does not stall the schedule.

`safeDispatch` wraps each trigger so one failure can't kill the tick.

### Why this is a correct per-run lock across instances
The claim `UPDATE … FOR UPDATE SKIP LOCKED` row-locks each due trigger; only one
instance wins each row, and nulling `next_run_at` in the same statement means no
later tick re-selects it until the worker writes the next occurrence. The
`trigger_runs` unique `(trigger_id, scheduled_for)` is a second, hard guarantee
against double-firing a given occurrence and doubles as run history.

## 6. Configuration

- `TRIGGER_DEFAULT_USER_ID` (backend env, a UUID) — `userId` for every trigger
  run. Documented in the backend env example; `userId` is a pass-through
  `nonEmpty` string in `AgentExecutionInputSchema`, so no auth-user row is
  required by the execution path.

## 7. FE wiring

- `EditorTabs.tsx` passes `agentId` into `<TriggersPanel>` (it is already an
  `EditorTabsProps` field).
- `TriggersPanel` accepts `agentId`; threads it into `useTriggers`; drops the
  edit-state path (add + delete only).
- `useTriggers(agentId, tenantId)` becomes async: load via `listTriggersAction`
  on mount / `(agentId, tenantId)` change (with `loading`/`error`); `addTrigger`
  → `createTriggerAction`; `deleteTrigger` → `deleteTriggerAction`.
- `TriggersListView`/`TriggerRow` remove the edit affordance; add list
  loading/error states. Preview keeps using the (now shared) schedule util.

## 8. i18n

`packages/web/messages/en.json` (single locale), under `editor.triggers`: add
`next`, `back`, `create`, `messageStepTitle`, `messageLabel`,
`messagePlaceholder`, `listLoading`, `listError`.

## 9. Error handling & resilience

- Web server actions catch via `extractError`, return `{ error }` (never throw
  to client). `Create` disabled on empty message blocks empty submissions.
- Worker: per-trigger `safeDispatch`; failed runs recorded in `trigger_runs`;
  schedule still advances (`finally`).
- **Known limitation:** if a worker process crashes *between* claiming (null
  `next_run_at`) and writing the next occurrence, that trigger stalls. Mitigation
  deferred to a follow-up (a stale-claim sweep using `trigger_runs.started_at`).
  Called out explicitly so it isn't mistaken for covered.

## 10. Testing / verification

- `npm run check` (format + lint + typecheck, all packages) — watch ESLint
  40-line/300-line limits during FE extraction and worker split.
- Backend Jest: `computeNextRun` cases (shared); `claim_due_triggers` claims
  each due row once under concurrent calls; `tickOnce` fires `executeAgentCore`
  with a fresh `sessionId` + default `userId` and advances `next_run_at`;
  `trigger_runs` ON CONFLICT prevents double-fire.
- Manual e2e: create a `once` trigger a minute out → agent fires once, a session
  is created, `trigger_runs` has one row, `next_run_at` clears; create a fast
  recurring trigger → fires repeatedly on cadence; run two backend instances →
  no double-fire.
```
