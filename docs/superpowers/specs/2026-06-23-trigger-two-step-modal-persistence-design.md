# Triggers: two-step modal, persistence, and an event-driven scheduler (Cloud Tasks)

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## Problem

The Triggers tab builds a schedule (recurring / once / after-event) but: (1) it
never captures the **initial message** the agent receives; (2) triggers live only
in client memory and never reach the backend; (3) nothing ever **fires** them.

We will: add a two-step modal (schedule → message), persist triggers through the
Client → Next.js server action → dedicated backend (`packages/backend`) flow, and
fire them **event-driven** via **Google Cloud Tasks** — one scheduled HTTP task
per occurrence. At the due instant Cloud Tasks POSTs an internal fire webhook,
which **arms the next occurrence, kicks off the run, and returns 202
immediately** (fire-and-forget); the run's outcome is recorded out-of-band.

## Repository reality (grounded)

Backend `packages/backend` (Express). It already mounts an **`/internal` router
guarded by `requireInternalAuth`** (a static `x-master-key` /
`EDGE_FUNCTION_MASTER_KEY` check) with a **path allowlist in `server.ts`**;
`agentRouter` uses a mounted sub-router pattern (`vfsConfigRouter`); a
**`RedisCompletionNotifier`** + `getNotifier().waitForCompletion(executionId)`
already exist (the non-streaming completion path). GCP stack (`@google-cloud/*`),
Upstash Redis present. Execution reuse seam:
`executeAgentCore({ supabase, orgId, agentId, version, input })`.

## Scope (single change)

- **Read + Write + Delete** of triggers (no schedule update/patch — editing is
  dropped; change = delete + re-create). One exception: an `enabled` pause toggle
  (PATCH; cancels/re-arms the task).
- Triggers scoped to **agent + tenant**.
- **Event-driven firing via Cloud Tasks**; **no poll anywhere** — no poll loop,
  no pg_cron producer, **no reconciliation sweep**. The recurring schedule is
  durable (next occurrence armed before the 202); a single in-flight run lost to
  a crash between 202 and completion is **accepted as rare** (no reaper).
- Each run gets a **fresh session id** + a **configurable default user id**, and
  fires the agent's **published production version** (assumption — confirm vs
  staging).

### Deferred (next iteration — "limits inside execution")

Minimum interval, per-org/agent active-trigger caps, per-org budget/cost
ceilings, after-event triggers. Cloud Tasks queue retry config + dispatch caps
give coarse fleet-wide backpressure; finer per-org governance is later.

## Component map (three homes by concern)

```
FE (web)                              Backend (packages/backend)              Shared / DB
─────────                             ──────────────────────────             ───────────
TriggerFormDialog (2 steps)           routes/agents/triggers/                shared-validation:
useTriggers (async CRUD+toggle)         triggerRouter + handler-per-verb       triggers/schedule.ts
actions/triggers.ts (proxy)           triggers/                                (TriggerSchedule union,
lib/triggers.ts (TriggerRow as-is)      scheduler.ts (TriggerScheduler iface)   computeNextRun skip-missed,
nextRun.ts (re-export shared)           cloudTasksScheduler.ts (adapter)        applyJitter recurring-only)
                                        fireHandler.ts (+ helpers)
                                      routes/internal/ (fire route,           db/queries/triggerQueries.ts
                                        requireInternalAuth + allowlist)
                                      getNotifier() → records outcome         migrations:
                                      → executeAgentCore → execute-agent        agent_triggers,
                                                                                trigger_runs (idempotency+audit)
   Google Cloud Tasks ──(POST /internal/triggers/fire, x-master-key, at scheduleTime)──▶ fireHandler → 202
```

## 1. Shared schedule logic (single source of truth)

`@openflow/shared-validation/src/triggers/schedule.ts`:

- **Discriminated union** (no illegal states):
  `TriggerSchedule = { mode:'recurring'; recurring: RecurringConfig } |
  { mode:'once'; onceDateTime: string } | { mode:'after-event' }`.
  `RecurringConfig` holds `unit, interval, weekdays, dayOfMonth, time, startAt,
  endAt`. Zod `TriggerScheduleSchema` for parsing (never casting).
- `computeNextRun(schedule, now): Date | null` — **skip-missed** (first occurrence
  strictly `> now`), returns **`null`** for once-in-the-past / past `endAt` /
  after-event. **Occurrence times are truncated to whole seconds** (so the
  integer epoch and the stored timestamptz are identical — see §4). `switch(mode)`
  with a `never` exhaustiveness check so a future mode is a compile error.
- `applyJitter(date, seed, windowMs)` — deterministic `hash(seed) % windowMs`,
  seed = `trigger_id`, **applied to recurring only** (a `once` trigger keeps the
  user's exact time). Backend-side at persist; FE preview is approximate
  (`previewApproximate` copy).
- Add `dayjs` to `shared-validation` deps; export via `package.json`.

**Typing layers (follow the `lib/tenants.ts` precedent):**
- shared `TriggerSchedule` — pure-math input.
- web `TriggerFormState = TriggerSchedule & { initialMessage: string }`
  (`DEFAULT_TRIGGER_STATE.initialMessage = ''`).
- **wire = snake_case `TriggerRow`** (web consumes it directly, like `TenantRow`).
- **backend-only** camelCase domain `Trigger`, built by `toTrigger(row)` which
  **Zod-parses the `recurring` jsonb into the union**.

Web `types.ts`/`nextRun.ts` re-export the shared module (mechanical shim).

## 2. UI — two-step modal

`TriggerFormDialog.tsx`; `FormBody` gains `step: 'schedule' | 'message'`.
Step 1 = schedule (footer `Cancel`·**`Next`**); step 2 = labeled `Textarea` bound
to `state.initialMessage` (footer **`Back`**·**`Create`**, `Create` disabled while
`initialMessage.trim() === ''`). Extract `ScheduleStep.tsx`, `MessageStep.tsx`,
`StepFooter` for the 40/300 ESLint limits.

## 3. Persistence + routes

### Web (mirrors `lib/tenants.ts` + `actions/tenants.ts`)
- `app/lib/triggers.ts` — `TriggerRow` type + guards + `fetchFromBackend` calls;
  `{ result, error }`. Web uses `TriggerRow` directly (no client-side mapping).
- `app/actions/triggers.ts` — `'use server'` wrappers (`serverLog`/`serverError`):
  `listTriggersAction`, `createTriggerAction`, `deleteTriggerAction`,
  `setTriggerEnabledAction`.

### Backend web-facing routes — mounted sub-router
`agentRouter.use('/:agentId/triggers', triggerRouter)` →
`routes/agents/triggers/triggerRouter.ts`, one handler file per verb, Zod-validated:
- `GET …/triggers?tenantId=` → `TriggerRow[]`
- `POST …/triggers` `{ tenantId, schedule, initialMessage }` → `TriggerRow`:
  compute `next_run_at` (whole-second; `applyJitter` for recurring), insert
  (`enabled=true`), then **arm the first Cloud Task** (deterministic name; §5).
- `PATCH …/triggers/:triggerId/enabled` `{ enabled }` — pause cancels the task +
  nulls `next_run_at`; resume re-arms.
- `DELETE …/triggers/:triggerId` — cancel task (best-effort/idempotent) + delete.

### Internal fire webhook (the event)
`POST /internal/triggers/fire` on the existing `/internal` router — reuse
**`requireInternalAuth`** (the `CloudTasksScheduler` attaches
`x-master-key: $EDGE_FUNCTION_MASTER_KEY` as a task header) and **register the
path in the `server.ts` allowlist**. No new auth code. (Dedicated OIDC
verification is noted as later hardening.) Body `{ triggerId, occurrenceEpoch }`.

`TriggerRow` (snake_case): `{ id, agent_id, tenant_id, org_id, mode, recurring,
once_datetime, initial_message, next_run_at, enabled, run_count, last_status,
last_run_at, created_at }`. **No `cloud_task_name`** — the task name is
deterministic and derived (§5), never stored.

## 4. Database (migration files only; user applies)

### `agent_triggers` (source of truth)
`id uuid pk`, `agent_id uuid`, `tenant_id uuid`, `org_id uuid`,
`mode text` **CHECK in (`recurring`,`once`,`after-event`)**,
`recurring jsonb null`, `once_datetime timestamptz null`,
`initial_message text not null`, `next_run_at timestamptz null` (whole-second),
`enabled boolean not null default true`, `run_count int not null default 0`,
`last_status text null`, `last_run_at timestamptz null`,
`created_at timestamptz default now()`. Counters are denormalized for cheap list
reads (no `trigger_runs` join). No stored task name.

### `trigger_runs` (idempotency + audit)
`id uuid pk`, `trigger_id uuid`, `scheduled_for timestamptz not null`
(whole-second), `session_id uuid not null default gen_random_uuid()`,
`status text not null` **CHECK in (`running`,`succeeded`,`failed`)**,
`failure_reason text null`, `error text null`,
`started_at timestamptz default now()`, `finished_at timestamptz null`.
**Range-partitioned by `scheduled_for` (daily)**; **idempotency key
`UNIQUE(trigger_id, scheduled_for)`** (partition column participates → legal;
whole-second precision means the payload's integer `occurrenceEpoch` reconstructs
to exactly this value). Retention = **partition drop** >30 days via one pg_cron
housekeeping job (the only pg_cron — not firing).

### `claim_and_rearm(p_trigger_id, p_scheduled_for, p_next_run_at)` RPC
Atomic, one round-trip: `INSERT trigger_runs(... status 'running') ON CONFLICT
(trigger_id, scheduled_for) DO NOTHING`; **if a row was inserted**, also `UPDATE
agent_triggers SET next_run_at = p_next_run_at` and return the new run
(`id`, `session_id`); **if conflict** (already handled by another delivery),
return empty → the handler acks 200 without running. Re-arm only happens on the
first delivery, alongside the claim.

### RLS (explicit)
`trigger_runs` is **service-only** (never client-read; fire handler + queries use
the service client). `agent_triggers` is reached only via the authenticated,
org-scoped backend routes; policies scope by `org_id` per existing conventions.

## 5. Event-driven scheduler

### `TriggerScheduler` seam (name-derived; swap-able transport)
`packages/backend/src/triggers/scheduler.ts`:
```ts
interface TriggerScheduler {
  schedule(o: { triggerId: string; runAt: Date; occurrenceEpoch: number }): Promise<void>;
  cancel(o: { triggerId: string; occurrenceEpoch: number }): Promise<void>;
}
```
The task name is **deterministic** (`trigger-{triggerId}-{occurrenceEpoch}`) and
computed **inside the adapter** — never stored, no return value, so there is no
"persist the name" step to fail (kills the orphaned-task/unarmed-row compensation
problem). Adapter #1 `CloudTasksScheduler` (`triggers/cloudTasksScheduler.ts`,
`@google-cloud/tasks`): creates an HTTP task on a dedicated queue targeting the
fire URL, `scheduleTime = runAt`, header `x-master-key`. `cancel` is best-effort
+ idempotent (`NOT_FOUND` = success). Config validation lives in the adapter
constructor. (Scale note: deterministic names carry a `CreateTask` throughput
penalty at very high rates — revisit behind this seam at P1/P2; per-occurrence
names avoid the name-reuse-window issue entirely.)

### Fire handler (`triggers/fireHandler.ts`) — fire-and-forget, decomposed
Helpers each well under 40 lines; the **executor is injected** (default
`executeAgentCore`) and the **scheduler is injected**, so the handler unit-tests
with fakes:
1. **auth** — `requireInternalAuth` (master key) already gates the route.
2. **`claimAndRearm(triggerId, occurrenceEpoch)`** — load trigger; if missing /
   disabled → 200 no-op. Compute next `next_run_at` (recurring: `applyJitter`+
   skip-missed; once/expired: `null`), call `scheduler.schedule(next)` /
   `scheduler.cancel`-or-nothing, then the `claim_and_rearm` RPC. **Re-arm the
   next occurrence's task BEFORE running** so the schedule survives a crash. RPC
   conflict (duplicate delivery) → **200 ack, do nothing** (dedupe-on-existence;
   a crashed prior `running` row is the accepted rare loss).
3. **dispatch** — `resolveExecutionContext(trigger)` (orgId + published prod
   version) + `buildTriggerInput(trigger, session_id)` (`{ tenantId,
   userId: TRIGGER_DEFAULT_USER_ID, sessionId, message: { text: initial_message },
   channel: 'api', stream: false }`), then **kick off the run without blocking
   the response** and **return 202**.
4. **outcome (out-of-band)** — record terminal status to `trigger_runs` +
   bump `agent_triggers` counters via the existing **`getNotifier()` completion
   path** (do not hold the edge-function SSE on the request). Preferred:
   rely on the Redis completion event so the BE doesn't pin the stream; if
   `executeAgentCore` must read the stream, run it detached (connection held on
   that instance, but the HTTP response is not blocked and Cloud Tasks' deadline
   is not at risk). Plan pins the exact mechanism against `executeAgentCore`.

### Why no coordination, no poll
Cloud Tasks POSTs each fire once to the **load-balanced** internal URL; any
instance handles it (no leader election, no claim contention). 202 within the
deadline regardless of run length. `UNIQUE(trigger_id, scheduled_for)` makes the
rare double-dispatch idempotent. Times come from Cloud Tasks `scheduleTime` + DB
values, so replica clock skew is immaterial. **`maxConcurrentDispatches` bounds
unacked dispatches — since we ack in 202 it governs webhook rate, not execution
concurrency**; execution concurrency is governed downstream (edge runtime
autoscales; per-org caps are the deferred iteration).

### Long-horizon "once" (>30 days)
Cloud Tasks `scheduleTime` maxes ~30 days. For a farther one-shot, arm a
**re-arm hop** (a task at `now+~29d` whose fire just arms the next hop) until the
target is within horizon. Still event-driven.

## 6. Configuration (named, env-overridable)

`TRIGGER_DEFAULT_USER_ID`, `GCP_PROJECT_ID`, `CLOUD_TASKS_LOCATION`,
`CLOUD_TASKS_QUEUE` (`agent-triggers`), `CLOUD_TASKS_SERVICE_ACCOUNT`,
`TRIGGER_FIRE_URL`, `TRIGGER_JITTER_WINDOW_MS`, `TRIGGER_MAX_ATTEMPTS`.
`EDGE_FUNCTION_MASTER_KEY` already exists (reused). Queue created with
`maxDispatchesPerSecond` + `maxConcurrentDispatches` + retry config (queue
`maxAttempts` + the `X-CloudTasks-TaskRetryCount` header are the authoritative
attempt counters; no DB attempt column needed).

## 7. FE wiring

`EditorTabs.tsx` passes `agentId` into `<TriggersPanel>`.
`useTriggers(agentId, tenantId)` async: load via `listTriggersAction`;
`addTrigger`→create; `deleteTrigger`→delete; `setEnabled`→`setTriggerEnabledAction`
(optimistic, revert on error). Drops the schedule-edit path. `TriggerRow` (the
component): remove edit; add a shadcn `Switch` for `enabled` + delete; show
`next_run_at`/paused/`last_status`. Preview uses the shared util.

## 8. i18n

`messages/en.json` under `editor.triggers`: `next`, `back`, `create`,
`messageStepTitle`, `messageLabel`, `messagePlaceholder`, `listLoading`,
`listError`, `enabledLabel`, `paused`, `enableTrigger`, `disableTrigger`,
`previewApproximate`.

## 9. Error handling & resilience

- Web actions catch via `extractError`, return `{ error }`; empty message blocked
  client-side.
- **Self-heal without poll:** the next occurrence's task is armed (DB + Cloud
  Task) **before** the 202, so crashes/deploys never break the recurring
  schedule. A single in-flight run lost between 202 and completion is **accepted
  as rare** (no reaper; user decision). Dedupe-on-existence prevents a rare
  double-dispatch from double-running.
- Two-system writes are robust by construction: deterministic task name (nothing
  to persist), `cancel` idempotent, fire-for-deleted/disabled = no-op. A failed
  create-time `schedule()` surfaces as a request error (client retries) — no
  silent unarmed row.
- **Observability:** reuse the existing `serverLog`/`logExec` utilities with a
  `[triggers]` prefix; structured per-fire logs (scheduled-vs-received latency,
  outcome). No bespoke logger, no backlog gauge (no queue).

## Scale & roadmap (explicit)

Cloud Tasks scales to millions of scheduled tasks and supplies durability,
retries, and coarse rate/concurrency. At high fire-rates the system is **provider-
and budget-bound, not infra-bound** (10k/s ≈ 864M/day, ~200k concurrent runs,
10k–100k+ LLM req/s, ~$8.6M/day at $0.01/run) — the deferred per-org budget/rate
caps govern throughput. Pre-commitments so the path needs adapters not rewrites:
the `TriggerScheduler` seam (Cloud Tasks → QStash/Temporal/broker), the integer
`occurrenceEpoch` idempotency key (ports to Redis `SETNX`), partitioned
`trigger_runs`, jitter. Heavy P2/P3 infra + per-org governance are out of scope.

## 10. Testing / verification

- `npm run check` (all packages); watch ESLint 40/300 in FE + handler splits.
- Shared: `computeNextRun` skip-missed + `null` past `endAt` + whole-second
  truncation + `never`-exhaustive mode; `applyJitter` deterministic/bounded and
  **not applied to `once`**; `TriggerScheduleSchema` parse/reject.
- Backend (executor + scheduler **injected as fakes**): create arms a task; PATCH
  disable cancels + nulls, enable re-arms; delete cancels; `fireHandler` returns
  **202 without awaiting the run**; `claim_and_rearm` re-arms + claims atomically
  and a duplicate delivery no-ops (200); outcome recorded via a notifier fake;
  master-key auth rejects unsigned calls. `trigger_runs` unique/partition need a
  real-PG harness (pgTAP / containerized PG).
- Manual e2e: `once` a minute out → fires once, session created, one run row,
  `next_run_at` clears; recurring → fires on cadence with jitter; disable →
  task cancelled, no fire; two BE instances → fires land on either, no double-run;
  a run >10 min still reports (no Cloud Tasks deadline hit).
```
