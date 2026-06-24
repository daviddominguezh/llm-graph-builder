# Triggers: Two-Step Modal, Persistence & Event-Driven Scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach a schedule + initial message to an agent (two-step modal), persist it via the backend, and fire the agent at the scheduled times event-driven through Google Cloud Tasks.

**Architecture:** Schedule math lives once in `@openflow/shared-validation`. Web persists triggers through server actions → `packages/backend` Express routes → `agent_triggers`. Each occurrence is registered as a Cloud Tasks scheduled HTTP task; at the due instant Cloud Tasks POSTs `/internal/triggers/fire`, which arms the next occurrence, claims the run, kicks off `executeAgentCore` (fire-and-forget, 202), and records the outcome out-of-band via the existing `RedisCompletionNotifier`.

**Tech Stack:** TypeScript (strict, ESM), Next.js 16 (web), Express (backend), Supabase/Postgres, `@google-cloud/tasks`, `dayjs`, Zod, Jest.

## Global Constraints

- ESLint (no disables): `max-lines-per-function` 40 (skip blanks/comments), `max-lines` 300/file, `max-depth` 2. When hit, extract helpers / split files — never compress lines.
- TypeScript strict, `noUncheckedIndexedAccess`; **never `any`**; explicit types.
- ESM modules (NodeNext); backend imports use `.js` extensions.
- Always add i18n for user-facing text (`packages/web/messages/en.json`).
- shadcn/ui components only (web); never `!important`.
- Trigger runs always use the **published production version** (`agents.current_version`), `channel: 'api'`, fresh `sessionId`, `userId = TRIGGER_DEFAULT_USER_ID`.
- Occurrence identity is **whole-second** UTC everywhere (DB `scheduled_for`, payload `occurrenceEpoch = floor(ms/1000)`).
- Migrations are written as files only — **do not apply them** (the user applies migrations).
- Run `npm run check` (format + lint + typecheck, all packages) before finishing each phase.

---

## File Structure

**Shared (`packages/shared-validation/`)**
- Create `src/triggers/schedule.ts` — schedule types, Zod schema, `computeNextRun` (Dayjs, web preview), `computeNextRunAt` (Date, backend), `applyJitter`, `computePreviewRuns`.
- Modify `package.json` — add `dayjs` dep + `./triggers/schedule` export.

**Web (`packages/web/`)**
- Modify `app/components/agents/triggers/types.ts` — re-export shared types; add `initialMessage`.
- Modify `app/components/agents/triggers/nextRun.ts` — re-export shared math.
- Create `app/lib/triggers.ts` — `TriggerRow` + guards + `fetchFromBackend` calls.
- Create `app/actions/triggers.ts` — server actions.
- Modify `app/components/agents/triggers/TriggerFormDialog.tsx` — two-step wizard.
- Create `app/components/agents/triggers/ScheduleStep.tsx`, `MessageStep.tsx`, `StepFooter.tsx`.
- Rewrite `app/components/agents/triggers/useTriggers.ts` — async CRUD + toggle.
- Modify `app/components/agents/triggers/TriggersPanel.tsx` — accept `agentId`.
- Modify `app/components/agents/triggers/TriggersListView.tsx` + `TriggerRow.tsx` — drop edit, add enabled `Switch`, loading/error.
- Modify `app/.../editor/[agentSlug]/EditorTabs.tsx` — pass `agentId` to `<TriggersPanel>`.
- Modify `messages/en.json`.

**Backend (`packages/backend/src/`)**
- Create `triggers/scheduler.ts` — `TriggerScheduler` interface.
- Create `triggers/cloudTasksScheduler.ts` — Cloud Tasks adapter.
- Create `triggers/fireHandler.ts` (+ `triggers/fireHelpers.ts`) — the webhook.
- Create `db/queries/triggerQueries.ts` — DB access + `claim_and_rearm` RPC call.
- Create `routes/agents/triggers/triggerRouter.ts` + `listTriggers.ts` / `createTrigger.ts` / `deleteTrigger.ts` / `setTriggerEnabled.ts`.
- Modify `routes/agents/agentRouter.ts` — mount `triggerRouter`.
- Modify `routes/internal/internalRouter.ts` — add fire route.
- Modify `server.ts` — register `/internal/triggers/fire` in the gate allowlist.

**Migrations (`supabase/migrations/`)**
- Create `<ts>_agent_triggers.sql`, `<ts>_trigger_runs.sql` (+ partition + RPC + retention cron + RLS).

---

## Phase A — Shared schedule module

### Task A1: schedule types + Zod + jitter + Date wrapper in shared-validation

**Files:**
- Create: `packages/shared-validation/src/triggers/schedule.ts`
- Modify: `packages/shared-validation/package.json`
- Test: `packages/shared-validation/src/triggers/schedule.test.ts`

**Interfaces:**
- Produces: `ScheduleMode`, `RecurringUnit`, `Weekday`, `RecurringConfig`, `TriggerScheduleInput` (flat), `TriggerSchedule` (union), `TriggerScheduleSchema` (zod), `computeNextRun(input, now: Dayjs): Dayjs | null`, `computeNextRunAt(input, now: Date): Date | null`, `applyJitter(date: Date, seed: string, windowMs: number): Date`, `computePreviewRuns(...)`, `toTriggerSchedule(input): TriggerSchedule`.

- [ ] **Step 1: Add dayjs dependency + export**

In `packages/shared-validation/package.json`, add to `dependencies`: `"dayjs": "^1.11.13"`. Add to `exports`:
```json
"./triggers/schedule": { "types": "./dist/triggers/schedule.d.ts", "import": "./dist/triggers/schedule.js" }
```
Run: `npm install` (root).

- [ ] **Step 2: Write the failing tests**

```ts
// packages/shared-validation/src/triggers/schedule.test.ts
import dayjs from 'dayjs';
import { applyJitter, computeNextRunAt, TriggerScheduleSchema, type TriggerScheduleInput } from './schedule.js';

const recurringMins = (interval: number): TriggerScheduleInput => ({
  mode: 'recurring',
  recurring: { unit: 'minutes', interval, weekdays: ['mon'], dayOfMonth: 1, time: '09:00', startAt: '', endAt: '' },
  onceDateTime: '',
});

describe('computeNextRunAt', () => {
  it('returns a whole-second Date in the future for recurring minutes', () => {
    const now = new Date('2026-06-24T10:00:00.500Z');
    const next = computeNextRunAt(recurringMins(5), now);
    expect(next).not.toBeNull();
    expect(next!.getTime() % 1000).toBe(0); // whole-second
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
  });
  it('returns null for a once datetime in the past', () => {
    const input: TriggerScheduleInput = { mode: 'once', onceDateTime: '2000-01-01T00:00:00Z', recurring: recurringMins(5).recurring };
    expect(computeNextRunAt(input, new Date())).toBeNull();
  });
  it('returns null for after-event', () => {
    const input: TriggerScheduleInput = { mode: 'after-event', onceDateTime: '', recurring: recurringMins(5).recurring };
    expect(computeNextRunAt(input, new Date())).toBeNull();
  });
});

describe('applyJitter', () => {
  it('is deterministic per seed and bounded by the window', () => {
    const base = new Date('2026-06-24T09:00:00Z');
    const a = applyJitter(base, 'trigger-abc', 60000);
    const b = applyJitter(base, 'trigger-abc', 60000);
    expect(a.getTime()).toBe(b.getTime());
    expect(a.getTime()).toBeGreaterThanOrEqual(base.getTime());
    expect(a.getTime()).toBeLessThan(base.getTime() + 60000);
    expect(a.getTime() % 1000).toBe(0);
  });
});

describe('TriggerScheduleSchema', () => {
  it('rejects recurring without a recurring config', () => {
    expect(TriggerScheduleSchema.safeParse({ mode: 'recurring' }).success).toBe(false);
  });
  it('accepts a valid once schedule', () => {
    expect(TriggerScheduleSchema.safeParse({ mode: 'once', onceDateTime: '2026-06-24T09:00:00Z' }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -w packages/shared-validation -- --testPathPattern=schedule`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `schedule.ts`**

Port the existing web `nextRun.ts` body **verbatim** (the `nextDays`/`nextWeeks`/`nextMonths`/`alignedNext`/`nextRecurring`/`nextOnce`/`computeNextRun`/`computePreviewRuns` functions), then add the new types, Zod schema, Date wrapper, exhaustiveness, and jitter:

```ts
import dayjs, { type Dayjs } from 'dayjs';
import { z } from 'zod';

export type ScheduleMode = 'recurring' | 'once' | 'after-event';
export type RecurringUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULE_MODES: ScheduleMode[] = ['recurring', 'once', 'after-event'];
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const RECURRING_UNITS: RecurringUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];

export interface RecurringConfig {
  unit: RecurringUnit;
  interval: number;
  weekdays: Weekday[];
  dayOfMonth: number;
  time: string;
  startAt: string;
  endAt: string;
}

/** Flat shape consumed by the schedule math (the form carries all fields). */
export interface TriggerScheduleInput {
  mode: ScheduleMode;
  recurring: RecurringConfig;
  onceDateTime: string;
}

/** Clean domain union (no illegal states) — used at persistence/domain boundaries. */
export type TriggerSchedule =
  | { mode: 'recurring'; recurring: RecurringConfig }
  | { mode: 'once'; onceDateTime: string }
  | { mode: 'after-event' };

const RecurringConfigSchema = z.object({
  unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
  interval: z.number().int().positive(),
  weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
  dayOfMonth: z.number().int().min(1).max(31),
  time: z.string(),
  startAt: z.string(),
  endAt: z.string(),
});

export const TriggerScheduleSchema: z.ZodType<TriggerSchedule> = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('recurring'), recurring: RecurringConfigSchema }),
  z.object({ mode: z.literal('once'), onceDateTime: z.string().min(1) }),
  z.object({ mode: z.literal('after-event') }),
]);

export function toTriggerSchedule(input: TriggerScheduleInput): TriggerSchedule {
  switch (input.mode) {
    case 'recurring':
      return { mode: 'recurring', recurring: input.recurring };
    case 'once':
      return { mode: 'once', onceDateTime: input.onceDateTime };
    case 'after-event':
      return { mode: 'after-event' };
    default: {
      const _exhaustive: never = input.mode;
      return _exhaustive;
    }
  }
}

/* … verbatim port of weekdayIndex … nextRecurring … nextOnce … from web nextRun.ts …
   (computeNextRun keeps signature: (state: TriggerScheduleInput, now?: Dayjs) => Dayjs | null) */

const MS_PER_SECOND = 1000;

/** Backend entrypoint: whole-second JS Date (or null). */
export function computeNextRunAt(input: TriggerScheduleInput, now: Date): Date | null {
  const next = computeNextRun(input, dayjs(now));
  if (next === null) return null;
  return new Date(Math.floor(next.valueOf() / MS_PER_SECOND) * MS_PER_SECOND);
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic, bounded, whole-second jitter. Caller applies to recurring only. */
export function applyJitter(date: Date, seed: string, windowMs: number): Date {
  if (windowMs <= 0) return date;
  const offsetMs = (hashSeed(seed) % windowMs);
  const jittered = date.getTime() + offsetMs;
  return new Date(Math.floor(jittered / MS_PER_SECOND) * MS_PER_SECOND);
}
```
Keep the existing `computeNextRun`/`computePreviewRuns`/`PreviewRunItem`/`PreviewRuns` exports (verbatim) so the web preview keeps working.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w packages/shared-validation -- --testPathPattern=schedule`
Expected: PASS. Then `npm run typecheck -w packages/shared-validation` (PASS).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-validation/src/triggers/schedule.ts packages/shared-validation/src/triggers/schedule.test.ts packages/shared-validation/package.json package-lock.json
git commit -m "feat(shared): trigger schedule math, jitter, and zod schema"
```

### Task A2: Web re-export shim + initialMessage

**Files:**
- Modify: `packages/web/app/components/agents/triggers/types.ts`
- Modify: `packages/web/app/components/agents/triggers/nextRun.ts`

**Interfaces:**
- Consumes: shared `@openflow/shared-validation/triggers/schedule`.
- Produces: web `TriggerFormState = TriggerScheduleInput & { initialMessage: string }`, `Trigger = TriggerFormState & { id: string }`, `DEFAULT_TRIGGER_STATE`.

- [ ] **Step 1: Re-export shared types + add initialMessage**

Replace `types.ts` with re-exports + the web-only additions:
```ts
export type {
  ScheduleMode, RecurringUnit, Weekday, RecurringConfig, TriggerScheduleInput,
} from '@openflow/shared-validation/triggers/schedule';
export { SCHEDULE_MODES, WEEKDAYS, RECURRING_UNITS } from '@openflow/shared-validation/triggers/schedule';
import type { TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';

export interface TriggerFormState extends TriggerScheduleInput {
  initialMessage: string;
}
export interface Trigger extends TriggerFormState {
  id: string;
}

const DEFAULT_INTERVAL = 5;
const FIRST_DAY_OF_MONTH = 1;
export const DEFAULT_TRIGGER_STATE: TriggerFormState = {
  mode: 'recurring',
  recurring: { unit: 'minutes', interval: DEFAULT_INTERVAL, weekdays: ['mon'], dayOfMonth: FIRST_DAY_OF_MONTH, time: '09:00', startAt: '', endAt: '' },
  onceDateTime: '',
  initialMessage: '',
};
```

- [ ] **Step 2: Re-export math from nextRun.ts**

Replace `nextRun.ts` with:
```ts
export {
  computeNextRun, computePreviewRuns, type PreviewRunItem, type PreviewRuns,
} from '@openflow/shared-validation/triggers/schedule';
```

- [ ] **Step 3: Typecheck the web package**

Run: `npm run typecheck -w packages/web`
Expected: PASS (existing preview components still resolve `computeNextRun`/`PreviewRuns`; `TriggerFormState` now also carries `initialMessage`, defaulted in `DEFAULT_TRIGGER_STATE`).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/agents/triggers/types.ts packages/web/app/components/agents/triggers/nextRun.ts
git commit -m "refactor(web): re-export shared schedule; add initialMessage to TriggerFormState"
```

---

## Phase B — Database migrations (files only; user applies)

### Task B1: agent_triggers table + RLS

**Files:**
- Create: `supabase/migrations/20260624000000_agent_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE public.agent_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('recurring','once','after-event')),
  recurring jsonb,
  once_datetime timestamptz,
  initial_message text NOT NULL,
  next_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  armed_task_epoch bigint, -- hopEpoch of the currently-armed Cloud Task (for exact cancel); null when none
  run_count int NOT NULL DEFAULT 0,
  last_status text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_triggers_agent_tenant_idx ON public.agent_triggers (agent_id, tenant_id);

ALTER TABLE public.agent_triggers ENABLE ROW LEVEL SECURITY;
-- Service role (backend) bypasses RLS. No client policies: the browser never
-- reads this table directly (web → backend routes only). Add an org-scoped
-- SELECT policy only if a future client-direct read is introduced.
```

- [ ] **Step 2: Commit (do NOT apply)**

```bash
git add supabase/migrations/20260624000000_agent_triggers.sql
git commit -m "feat(db): agent_triggers table (migration only)"
```

### Task B2: trigger_runs partitioned table + claim_and_rearm RPC + retention

**Files:**
- Create: `supabase/migrations/20260624000001_trigger_runs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Range-partitioned by scheduled_for (whole-second, set by the backend). The
-- idempotency UNIQUE includes the partition key (legal on partitioned tables).
CREATE TABLE public.trigger_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  failure_reason text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (trigger_id, scheduled_for, id),
  UNIQUE (trigger_id, scheduled_for)
) PARTITION BY RANGE (scheduled_for);

ALTER TABLE public.trigger_runs ENABLE ROW LEVEL SECURITY;
-- Service-only: never client-read. No client policies.

-- Real daily partitions + rolling create/drop (no DEFAULT partition; no DELETE
-- churn). create_trigger_runs_partition makes one day; maintain_trigger_runs
-- ensures the next 3 days exist and DROPs partitions older than the 30-day
-- retention window. Both invoked by pg_cron below.
CREATE OR REPLACE FUNCTION public.create_trigger_runs_partition(p_day date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE part text := format('trigger_runs_%s', to_char(p_day, 'YYYYMMDD'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.trigger_runs FOR VALUES FROM (%L) TO (%L)',
    part, p_day::timestamptz, (p_day + 1)::timestamptz);
END $$;

CREATE OR REPLACE FUNCTION public.maintain_trigger_runs()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d int; old_part text; r record;
BEGIN
  FOR d IN 0..3 LOOP
    PERFORM public.create_trigger_runs_partition((now() AT TIME ZONE 'UTC')::date + d);
  END LOOP;
  FOR r IN
    SELECT c.relname FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'trigger_runs'
      AND c.relname < format('trigger_runs_%s', to_char((now() AT TIME ZONE 'UTC')::date - 30, 'YYYYMMDD'))
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I', r.relname);
  END LOOP;
END $$;

-- Bootstrap today + the next few days so inserts never fail before the cron runs.
SELECT public.maintain_trigger_runs();

-- Atomic enabled-gate + claim + re-arm in ONE round-trip. Locks the parent row,
-- returns empty when the trigger is disabled/deleted (so the fire neither runs
-- nor re-arms — the re-arm chain dies cleanly), inserts the run, advances the
-- schedule, and returns the run. ON CONFLICT → empty (duplicate delivery).
CREATE OR REPLACE FUNCTION public.claim_and_rearm(
  p_trigger_id uuid, p_scheduled_for timestamptz, p_next_run_at timestamptz
) RETURNS TABLE (run_id uuid, session_id uuid)
LANGUAGE plpgsql AS $$
DECLARE v_enabled boolean; v_run_id uuid; v_session uuid;
BEGIN
  SELECT enabled INTO v_enabled FROM public.agent_triggers WHERE id = p_trigger_id FOR UPDATE;
  IF v_enabled IS NULL OR v_enabled = false THEN
    RETURN; -- deleted or paused: do not run, do not re-arm
  END IF;

  INSERT INTO public.trigger_runs (trigger_id, scheduled_for, status)
  VALUES (p_trigger_id, p_scheduled_for, 'running')
  ON CONFLICT (trigger_id, scheduled_for) DO NOTHING
  RETURNING id, trigger_runs.session_id INTO v_run_id, v_session;

  IF v_run_id IS NULL THEN
    RETURN; -- duplicate delivery
  END IF;

  UPDATE public.agent_triggers
  SET next_run_at = p_next_run_at, last_run_at = now(), run_count = run_count + 1
  WHERE id = p_trigger_id;

  run_id := v_run_id; session_id := v_session;
  RETURN NEXT;
END $$;

-- Daily partition maintenance (create-ahead + drop-old). Housekeeping, not firing.
SELECT cron.schedule('maintain-trigger-runs', '17 3 * * *', $$ SELECT public.maintain_trigger_runs(); $$);
```

- [ ] **Step 2: Commit (do NOT apply)**

```bash
git add supabase/migrations/20260624000001_trigger_runs.sql
git commit -m "feat(db): trigger_runs partitioned table, claim_and_rearm RPC, retention (migration only)"
```

---

## Phase C — Backend: scheduler, queries, fire handler, routes

### Task C1: TriggerScheduler interface + Cloud Tasks adapter

**Files:**
- Create: `packages/backend/src/triggers/scheduler.ts`
- Create: `packages/backend/src/triggers/cloudTasksScheduler.ts`
- Test: `packages/backend/src/triggers/__tests__/cloudTasksScheduler.test.ts`

**Interfaces:**
- Produces: `interface TriggerScheduler { schedule(o): Promise<void>; cancel(o): Promise<void> }`; `taskNameFor(triggerId, occurrenceEpoch): string`; `createCloudTasksScheduler(deps): TriggerScheduler`.

- [ ] **Step 1: Write the interface + pure name helper**

```ts
// packages/backend/src/triggers/scheduler.ts
import type { TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';

/** Self-contained data the fire webhook needs WITHOUT a DB read of the trigger
 *  row. The fresh production version is resolved at fire time (not embedded). */
export interface TriggerTaskPayload {
  triggerId: string;
  targetEpoch: number;   // whole-second epoch of the OCCURRENCE (when the agent runs; = scheduled_for / idempotency key)
  hopEpoch: number;      // whole-second epoch of THIS task's own fire time (= scheduleTime; used for the task name). hopEpoch === targetEpoch ⇒ real fire; hopEpoch < targetEpoch ⇒ continuation hop
  agentId: string;
  tenantId: string;
  initialMessage: string;
  schedule: TriggerScheduleInput;
}
export interface ScheduleInput { runAt: Date; payload: TriggerTaskPayload }
export interface CancelInput { triggerId: string; taskEpoch: number } // taskEpoch = the armed task's hopEpoch (agent_triggers.armed_task_epoch)
export interface TriggerScheduler {
  schedule(input: ScheduleInput): Promise<void>;
  cancel(input: CancelInput): Promise<void>;
}
export function taskNameFor(triggerId: string, taskEpoch: number): string {
  return `trigger-${triggerId}-${taskEpoch}`;
}
```
Names are keyed by `hopEpoch` (each task's own fire time) so a continuation hop and the eventual real fire toward the same `targetEpoch` get **distinct** names — avoiding Cloud Tasks' post-completion name-reuse block.

- [ ] **Step 2: Write failing tests for the adapter (with a fake Cloud Tasks client)**

```ts
// __tests__/cloudTasksScheduler.test.ts
import { createCloudTasksScheduler } from '../cloudTasksScheduler.js';

function fakeClient() {
  const created: unknown[] = []; const deleted: string[] = [];
  return {
    created, deleted,
    queuePath: (p: string, l: string, q: string) => `projects/${p}/locations/${l}/queues/${q}`,
    createTask: async (req: unknown) => { created.push(req); return [{}]; },
    deleteTask: async (req: { name: string }) => { deleted.push(req.name); return [{}]; },
  };
}
const cfg = { projectId: 'p', location: 'l', queue: 'agent-triggers', serviceAccount: 'sa@x', fireUrl: 'https://api/internal/triggers/fire', masterKey: 'mk' };

const payload = { triggerId: 't1', targetEpoch: 1782637200, hopEpoch: 1782637200, agentId: 'a1', tenantId: 'te1', initialMessage: 'hi', schedule: { mode: 'once', onceDateTime: '', recurring: { unit: 'minutes', interval: 5, weekdays: [], dayOfMonth: 1, time: '09:00', startAt: '', endAt: '' } } } as const;

it('names the task by hopEpoch and creates an HTTP task with scheduleTime, x-master-key, and the payload body', async () => {
  const c = fakeClient();
  const s = createCloudTasksScheduler({ client: c as never, config: cfg });
  await s.schedule({ runAt: new Date('2026-06-24T09:00:00Z'), payload });
  expect(c.created).toHaveLength(1);
  const req = c.created[0] as { task: { name: string; httpRequest: { url: string; headers: Record<string,string>; body: string } } };
  expect(req.task.name.endsWith('trigger-t1-1782637200')).toBe(true); // hopEpoch
  expect(req.task.httpRequest.url).toBe(cfg.fireUrl);
  expect(req.task.httpRequest.headers['x-master-key']).toBe('mk');
  expect(JSON.parse(Buffer.from(req.task.httpRequest.body, 'base64').toString()).agentId).toBe('a1');
});

it('cancel treats NOT_FOUND as success (idempotent)', async () => {
  const c = fakeClient();
  c.deleteTask = async () => { const e = new Error('not found') as Error & { code?: number }; e.code = 5; throw e; };
  const s = createCloudTasksScheduler({ client: c as never, config: cfg });
  await expect(s.cancel({ triggerId: 't1', taskEpoch: 1782637200 })).resolves.toBeUndefined();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -w packages/backend -- --testPathPattern=cloudTasksScheduler`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the adapter**

```ts
// packages/backend/src/triggers/cloudTasksScheduler.ts
import type { CancelInput, ScheduleInput, TriggerScheduler } from './scheduler.js';
import { taskNameFor } from './scheduler.js';

export interface CloudTasksConfig {
  projectId: string; location: string; queue: string;
  serviceAccount: string; fireUrl: string; masterKey: string;
}
interface TasksClientLike {
  queuePath(p: string, l: string, q: string): string;
  createTask(req: unknown): Promise<unknown>;
  deleteTask(req: { name: string }): Promise<unknown>;
}
const GRPC_NOT_FOUND = 5;
const MS_PER_SECOND = 1000;

export function createCloudTasksScheduler(deps: { client: TasksClientLike; config: CloudTasksConfig }): TriggerScheduler {
  const { client, config } = deps;
  const fullName = (triggerId: string, epoch: number): string =>
    `${client.queuePath(config.projectId, config.location, config.queue)}/tasks/${taskNameFor(triggerId, epoch)}`;

  return {
    async schedule(input: ScheduleInput): Promise<void> {
      const { payload } = input;
      await client.createTask({
        parent: client.queuePath(config.projectId, config.location, config.queue),
        task: {
          name: fullName(payload.triggerId, payload.hopEpoch),
          scheduleTime: { seconds: Math.floor(input.runAt.getTime() / MS_PER_SECOND) },
          httpRequest: {
            httpMethod: 'POST',
            url: config.fireUrl,
            headers: { 'Content-Type': 'application/json', 'x-master-key': config.masterKey },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
        },
      });
    },
    async cancel(input: CancelInput): Promise<void> {
      try {
        await client.deleteTask({ name: fullName(input.triggerId, input.taskEpoch) });
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === GRPC_NOT_FOUND) return;
        throw err;
      }
    },
  };
}
```

- [ ] **Step 5: Local timer adapter (no GCP) — `localTimerScheduler.ts`**

Create `packages/backend/src/triggers/localTimerScheduler.ts` — a second `TriggerScheduler` adapter for local dev / CI that POSTs the **real** fire webhook via in-process timers, so the entire fire path runs identically to production. ~30 lines:

```ts
import type { CancelInput, ScheduleInput, TriggerScheduler } from './scheduler.js';
import { taskNameFor } from './scheduler.js';

const MAX_DELAY_MS = 2_147_483_647; // setTimeout ceiling (~24.8 days)

export function createLocalTimerScheduler(deps: { fireUrl: string; masterKey: string }): TriggerScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    async schedule(input: ScheduleInput): Promise<void> {
      const name = taskNameFor(input.payload.triggerId, input.payload.hopEpoch);
      const delay = Math.min(MAX_DELAY_MS, Math.max(0, input.runAt.getTime() - Date.now())); // armToward keeps delay ≤ horizon < MAX_DELAY_MS; clamp is a defensive backstop only
      const existing = timers.get(name);
      if (existing !== undefined) clearTimeout(existing); // idempotent by name (mirror Cloud Tasks)
      const timer = setTimeout(() => {
        timers.delete(name);
        void fetch(deps.fireUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-master-key': deps.masterKey },
          body: JSON.stringify(input.payload),
        }).catch(() => undefined);
      }, delay);
      if (typeof timer.unref === 'function') timer.unref();
      timers.set(name, timer);
    },
    async cancel(input: CancelInput): Promise<void> {
      const name = taskNameFor(input.triggerId, input.taskEpoch);
      const t = timers.get(name);
      if (t !== undefined) { clearTimeout(t); timers.delete(name); }
    },
  };
}
```
Add a test: `schedule` with `runAt` ~now (fake-timers) POSTs `fireUrl` with the payload + `x-master-key`; `cancel` before the delay prevents the POST; re-`schedule` of the same name clears the prior timer. Use Jest fake timers + a `global.fetch` mock.

- [ ] **Step 6: Scheduler singleton + adapter selection (created here so C4 can import it)**

Create `packages/backend/src/triggers/schedulerSingleton.ts`: export `getTriggerScheduler(): TriggerScheduler`, memoized, **selecting the adapter by the existing `PRODUCTION` env convention** (`packages/backend/.env.example` ships `PRODUCTION=false`):
- **`process.env.PRODUCTION === 'true'` → Cloud Tasks:** validate `GCP_PROJECT_ID`/`CLOUD_TASKS_LOCATION`/`CLOUD_TASKS_QUEUE`/`CLOUD_TASKS_SERVICE_ACCOUNT`/`TRIGGER_FIRE_URL`/`EDGE_FUNCTION_MASTER_KEY`, construct a `CloudTasksClient` (`@google-cloud/tasks`), `createCloudTasksScheduler({ client, config })`.
- **otherwise → local timer:** `createLocalTimerScheduler({ fireUrl: TRIGGER_FIRE_URL, masterKey: EDGE_FUNCTION_MASTER_KEY })`. Requires only `TRIGGER_FIRE_URL` (e.g. `http://localhost:4000/internal/triggers/fire`) + `EDGE_FUNCTION_MASTER_KEY`.

Add `@google-cloud/tasks` to `packages/backend/package.json` deps; run `npm install`. (**Optional, not required for v1:** a `rehydrateTimers()` called at boot that loads `enabled` triggers with a future `next_run_at` and re-arms local timers — gives restart-survival in local dev without any polling loop. Leave as a documented follow-up.)

- [ ] **Step 7: Run tests (PASS) + typecheck, and commit**

Run: `npm run test -w packages/backend -- --testPathPattern='cloudTasksScheduler|localTimerScheduler'` (PASS); `npm run typecheck -w packages/backend`.
```bash
git add packages/backend/src/triggers/scheduler.ts packages/backend/src/triggers/cloudTasksScheduler.ts packages/backend/src/triggers/localTimerScheduler.ts packages/backend/src/triggers/schedulerSingleton.ts packages/backend/src/triggers/__tests__/ packages/backend/package.json package-lock.json
git commit -m "feat(backend): TriggerScheduler interface, Cloud Tasks + local adapters, scheduler singleton"
```

### Task C2: triggerQueries (CRUD + claim_and_rearm)

**Files:**
- Create: `packages/backend/src/db/queries/triggerQueries.ts`
- Test: `packages/backend/src/db/queries/__tests__/triggerQueries.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` (`db/queries/executionAuthQueries.js`), shared schedule types.
- Produces: `TriggerRow` type (**single source of truth** — the snake_case field list in spec §3; web Task D1 copies it verbatim, with a comment in each pointing to the other); `listTriggers(supabase, agentId, tenantId)`, `insertTrigger(supabase, params)`, `deleteTrigger(supabase, agentId, triggerId)`, `setTriggerEnabled(supabase, agentId, triggerId, enabled)`, `claimAndRearm(supabase, triggerId, scheduledFor, nextRunAt)`, `recordOutcome(supabase, runId, status, failureReason?, error?)` — `recordOutcome` updates the `trigger_runs` row terminal status **and** sets `agent_triggers.last_status` (the claim RPC already set `run_count`/`last_run_at`). `insertTrigger` maps the validated `TriggerSchedule` union to the flat columns (`mode`, `recurring` jsonb-or-null, `once_datetime`-or-null) and writes `next_run_at` + `armed_task_epoch`. Plus two small helpers for the hop: `isTriggerEnabled(supabase, triggerId): Promise<boolean>` (single `SELECT enabled`) and `setArmedTaskEpoch(supabase, triggerId, hopEpoch): Promise<void>` (`UPDATE agent_triggers SET armed_task_epoch = $2 WHERE id = $1`). `deleteTrigger`/`setTriggerEnabled(disable)` read `armed_task_epoch` to compute the `cancel({ triggerId, taskEpoch })` call. All return `{ result, error }` / `{ error }`.

- [ ] **Step 1: Write `TriggerRow` + failing test (against a fake supabase)**

```ts
// __tests__/triggerQueries.test.ts
import { mapNextRunAt } from '../triggerQueries.js';
it('serializes next_run_at to ISO or null', () => {
  expect(mapNextRunAt(new Date('2026-06-24T09:00:00Z'))).toBe('2026-06-24T09:00:00.000Z');
  expect(mapNextRunAt(null)).toBeNull();
});
```

- [ ] **Step 2: Run (FAIL), then implement `triggerQueries.ts`**

Follow the `ragFilesQueries.ts` / tenants query style (Supabase service client, `{ result, error }`). Include `export function mapNextRunAt(d: Date | null): string | null`, the `TriggerRow` interface (snake_case, matching the DB columns + Task 4 web `TriggerRow`), and a `claimAndRearm` that calls the RPC:
```ts
export async function claimAndRearm(
  supabase: SupabaseClient, triggerId: string, scheduledFor: Date, nextRunAt: Date | null
): Promise<{ result: { runId: string; sessionId: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_and_rearm', {
    p_trigger_id: triggerId,
    p_scheduled_for: scheduledFor.toISOString(),
    p_next_run_at: nextRunAt === null ? null : nextRunAt.toISOString(),
  });
  if (error !== null) return { result: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { result: null, error: null }; // duplicate delivery
  return { result: { runId: row.run_id, sessionId: row.session_id }, error: null };
}
```
Implement `listTriggers`/`insertTrigger`/`deleteTrigger`/`setTriggerEnabled`/`getTriggerById`/`recordOutcome` with `.from('agent_triggers')` / `.from('trigger_runs')` calls, each returning `{ result, error }`.

- [ ] **Step 3: Run (PASS) + typecheck, then commit**

Run: `npm run test -w packages/backend -- --testPathPattern=triggerQueries` (PASS); `npm run typecheck -w packages/backend` (PASS).
```bash
git add packages/backend/src/db/queries/triggerQueries.ts packages/backend/src/db/queries/__tests__/triggerQueries.test.ts
git commit -m "feat(backend): trigger DB queries + claim_and_rearm wrapper"
```

### Task C3: Fire handler + helpers

**Files:**
- Create: `packages/backend/src/triggers/fireHelpers.ts`
- Create: `packages/backend/src/triggers/fireHandler.ts`
- Test: `packages/backend/src/triggers/__tests__/fireHandler.test.ts`

**Interfaces:**
- Consumes: `claimAndRearm`/`recordOutcome` (`triggerQueries`), `TriggerScheduler` + `TriggerTaskPayload` (`scheduler`), shared `computeNextRunAt`/`applyJitter`, `executeAgentCore` (`routes/execute/executeCore.js`), `getAgentById` (`db/queries/agentQueries.js` — returns `{ result: { org_id, current_version, … }, error }`), `createServiceClient`.
- Produces: `nextRunFor(schedule, anchor, triggerId, jitterWindowMs): Date | null`, `buildTriggerInput(payload, sessionId, defaultUserId): AgentExecutionInput`, `resolveExecutionContext(supabase, agentId): Promise<{ orgId: string; version: number }>`, `createFireHandler(deps)` (Express handler), where `deps = { supabase, scheduler, defaultUserId, jitterWindowMs, execTimeoutMs, execute? }` and `execute` defaults to a thin wrapper over `executeAgentCore`.
- **Ordering decision (claim-first):** compute `next` (anchored on the occurrence) → `claim_and_rearm` (gates `enabled`, claims, sets `next_run_at`) → only on a real claim do we `scheduler.schedule(next)` and dispatch. Disabled/deleted/duplicate → RPC returns empty → 200, no task armed (re-arm chain dies cleanly, no zombie tasks). Accepted rare loss: a crash in the microsecond window between the RPC commit and `schedule()` breaks that one trigger's chain (no reaper, per the no-poll decision).

- [ ] **Step 1: Write failing tests (injected fakes)**

```ts
// __tests__/fireHandler.test.ts — exercises buildTriggerInput + handler control flow
import { buildTriggerInput } from '../fireHelpers.js';
const payload = { triggerId: 't1', occurrenceEpoch: 1782637200, agentId: 'a1', tenantId: 'te1', initialMessage: 'hello', schedule: { mode: 'once', onceDateTime: '', recurring: { unit: 'minutes', interval: 5, weekdays: [], dayOfMonth: 1, time: '09:00', startAt: '', endAt: '' } } } as const;

it('builds an api-channel, non-streaming input with default user + fresh session', () => {
  const input = buildTriggerInput(payload as never, 'sess-1', 'user-default');
  expect(input).toMatchObject({
    tenantId: 'te1', userId: 'user-default', sessionId: 'sess-1',
    message: { text: 'hello' }, channel: 'api', stream: false,
  });
});
```
Add a handler test (all deps injected as fakes — no DB): fake `claimAndRearm` returns `{ runId, sessionId }`; assert the handler (a) calls `claimAndRearm` **before** `scheduler.schedule`, (b) on a real claim arms the next occurrence and responds `202`, (c) when `claimAndRearm` returns `null` (disabled/duplicate) responds `200` and **does not** call `scheduler.schedule` or `execute`. Use a fake `execute` that records calls and a fake `getAgentById`.

- [ ] **Step 2: Run (FAIL), then implement `fireHelpers.ts`**

```ts
// fireHelpers.ts
import { applyJitter, computeNextRunAt, type TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';
import type { AgentExecutionInput } from '../routes/execute/executeTypes.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import { getAgentById } from '../db/queries/agentQueries.js';
import type { TriggerTaskPayload } from './scheduler.js';

/** Next occurrence anchored on the CURRENT occurrence (not wall-clock), so two
 *  deliveries compute the same `next` → the re-armed task is name-idempotent.
 *  Jitter applies to recurring only. */
export function nextRunFor(
  schedule: TriggerScheduleInput, anchor: Date, triggerId: string, jitterWindowMs: number
): Date | null {
  const next = computeNextRunAt(schedule, anchor);
  if (next === null) return null;
  return schedule.mode === 'recurring' ? applyJitter(next, triggerId, jitterWindowMs) : next;
}

export function buildTriggerInput(
  payload: TriggerTaskPayload, sessionId: string, defaultUserId: string
): AgentExecutionInput {
  return { tenantId: payload.tenantId, userId: defaultUserId, sessionId, message: { text: payload.initialMessage }, channel: 'api', stream: false };
}

/** Resolve the FRESH published production version at fire time (never embedded
 *  in the task — the agent may have been republished since arming). */
export async function resolveExecutionContext(
  supabase: SupabaseClient, agentId: string
): Promise<{ orgId: string; version: number }> {
  const { result, error } = await getAgentById(supabase, agentId);
  if (error !== null || result === null) throw new Error(`agent ${agentId} not found: ${error ?? 'null'}`);
  return { orgId: result.org_id, version: result.current_version };
}

const MS = 1000;
/** Base payload fields shared by every task of a trigger (no per-occurrence fields). */
export type TaskBase = Pick<TriggerTaskPayload, 'triggerId' | 'agentId' | 'tenantId' | 'initialMessage' | 'schedule'>;

/** Arm the task that moves a trigger toward `targetEpoch`. If the target is
 *  within `horizonMs`, arm the REAL fire (hopEpoch === targetEpoch); otherwise
 *  arm a continuation HOP at now+horizon (hopEpoch < targetEpoch). Adapter-
 *  agnostic — both Cloud Tasks and the local timer get the hop for free. Also
 *  records the armed hopEpoch for exact cancel. */
export async function armToward(
  deps: { supabase: SupabaseClient; scheduler: TriggerScheduler; horizonMs: number },
  base: TaskBase, targetEpoch: number, now: Date
): Promise<void> {
  const targetMs = targetEpoch * MS;
  const withinHorizon = targetMs - now.getTime() <= deps.horizonMs;
  const runAt = withinHorizon ? new Date(targetMs) : new Date(now.getTime() + deps.horizonMs);
  const hopEpoch = Math.floor(runAt.getTime() / MS);
  await deps.scheduler.schedule({ runAt, payload: { ...base, targetEpoch, hopEpoch } });
  await setArmedTaskEpoch(deps.supabase, base.triggerId, hopEpoch); // see triggerQueries (Task C2)
}
```
Imports for the additions: `import type { TriggerScheduler, TriggerTaskPayload } from './scheduler.js';` and `import { setArmedTaskEpoch } from '../db/queries/triggerQueries.js';`.

- [ ] **Step 3: Implement `fireHandler.ts` (claim-first, fire-and-forget, timed-out)**

The injected `execute(ctx, input)` is the seam: default = a thin `executeAgentCore` wrapper; tests pass a recorder. Keep each function ≤40 lines (extract `runAndRecord` + `defaultExecute` to their own functions).

```ts
import type { Request, Response } from 'express';
import { executeAgentCore } from '../routes/execute/executeCore.js';
import type { AgentExecutionInput } from '../routes/execute/executeTypes.js';
import { claimAndRearm, recordOutcome } from '../db/queries/triggerQueries.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import type { TriggerScheduler, TriggerTaskPayload } from './scheduler.js';
import { buildTriggerInput, nextRunFor, resolveExecutionContext } from './fireHelpers.js';

const HTTP_OK = 200; const HTTP_ACCEPTED = 202; const HTTP_BAD_REQUEST = 400;
const EPOCH_TO_MS = 1000;

type ExecCtx = { orgId: string; agentId: string; version: number };
type Execute = (ctx: ExecCtx, input: AgentExecutionInput) => Promise<void>;
interface FireDeps {
  supabase: SupabaseClient; scheduler: TriggerScheduler;
  defaultUserId: string; jitterWindowMs: number; execTimeoutMs: number; horizonMs: number; execute?: Execute;
}

function defaultExecute(supabase: SupabaseClient): Execute {
  return async (ctx, input) => {
    await executeAgentCore({ supabase, orgId: ctx.orgId, agentId: ctx.agentId, version: ctx.version, input });
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('trigger run timeout')), ms))]);
}

async function runAndRecord(deps: FireDeps, payload: TriggerTaskPayload, runId: string, sessionId: string): Promise<void> {
  const exec = deps.execute ?? defaultExecute(deps.supabase);
  try {
    const ctx = await resolveExecutionContext(deps.supabase, payload.agentId);
    const input = buildTriggerInput(payload, sessionId, deps.defaultUserId);
    await withTimeout(exec({ ...ctx, agentId: payload.agentId }, input), deps.execTimeoutMs);
    await recordOutcome(deps.supabase, runId, 'succeeded');
  } catch (e) {
    await recordOutcome(deps.supabase, runId, 'failed', 'execution_error', e instanceof Error ? e.message : String(e));
  }
}

function parsePayload(body: unknown): TriggerTaskPayload | null {
  const p = body as Partial<TriggerTaskPayload>;
  if (typeof p?.triggerId !== 'string' || typeof p?.targetEpoch !== 'number' || typeof p?.hopEpoch !== 'number') return null;
  if (typeof p.agentId !== 'string' || typeof p.tenantId !== 'string' || typeof p.initialMessage !== 'string') return null;
  if (typeof p.schedule !== 'object' || p.schedule === null) return null;
  return p as TriggerTaskPayload;
}

function baseOf(p: TriggerTaskPayload): TaskBase {
  return { triggerId: p.triggerId, agentId: p.agentId, tenantId: p.tenantId, initialMessage: p.initialMessage, schedule: p.schedule };
}

// Continuation hop: target still beyond horizon. Re-arm toward it (no run), but
// only while enabled, so a paused trigger's stray hop stops the chain.
async function handleContinuation(deps: FireDeps, p: TriggerTaskPayload, res: Response): Promise<void> {
  if (await isTriggerEnabled(deps.supabase, p.triggerId)) {
    await armToward({ supabase: deps.supabase, scheduler: deps.scheduler, horizonMs: deps.horizonMs }, baseOf(p), p.targetEpoch, new Date());
  }
  res.status(HTTP_OK).json({ ok: true, continuation: true });
}

export function createFireHandler(deps: FireDeps) {
  return async function fire(req: Request, res: Response): Promise<void> {
    const payload = parsePayload(req.body);
    if (payload === null) { res.status(HTTP_BAD_REQUEST).json({ error: 'invalid body' }); return; }
    if (payload.hopEpoch !== payload.targetEpoch) { await handleContinuation(deps, payload, res); return; }

    // Real fire. Claim FIRST: gates enabled, claims the run, advances next_run_at.
    // null = disabled / deleted / duplicate → ack 200, arm nothing (chain dies cleanly).
    const scheduledFor = new Date(payload.targetEpoch * EPOCH_TO_MS);
    const next = nextRunFor(payload.schedule, scheduledFor, payload.triggerId, deps.jitterWindowMs);
    const { result: run } = await claimAndRearm(deps.supabase, payload.triggerId, scheduledFor, next);
    if (run === null) { res.status(HTTP_OK).json({ ok: true, skipped: true }); return; }

    if (next !== null) {
      await armToward({ supabase: deps.supabase, scheduler: deps.scheduler, horizonMs: deps.horizonMs },
        baseOf(payload), Math.floor(next.getTime() / EPOCH_TO_MS), new Date());
    }
    void runAndRecord(deps, payload, run.runId, run.sessionId); // detached
    res.status(HTTP_ACCEPTED).json({ ok: true });
  };
}
```
Add imports: `armToward`, `baseOf`'s `TaskBase` type from `./fireHelpers.js`, and `isTriggerEnabled` from `../db/queries/triggerQueries.js`.
**Implementer note (v1 accepted):** `executeAgentCore` awaits the edge-function SSE to completion, so the detached `runAndRecord` holds an outbound connection for the run's duration (the 202 only unblocks the HTTP response). This is accepted for v1 (I/O-bound, fine at hundreds concurrent) and bounded by `withTimeout`. The true no-hold path (pre-generate an `executionId`, dispatch, and record via `getNotifier().waitForCompletion(executionId, timeoutMs)` on the Redis completion event) is deferred to P2.

- [ ] **Step 4: Run tests (PASS) + typecheck, then commit**

Run: `npm run test -w packages/backend -- --testPathPattern=fireHandler` (PASS); `npm run typecheck -w packages/backend`.
```bash
git add packages/backend/src/triggers/fireHelpers.ts packages/backend/src/triggers/fireHandler.ts packages/backend/src/triggers/__tests__/fireHandler.test.ts
git commit -m "feat(backend): event-driven trigger fire handler (fire-and-forget)"
```

### Task C4: Web-facing trigger routes (sub-router)

**Files:**
- Create: `packages/backend/src/routes/agents/triggers/triggerRouter.ts` + `listTriggers.ts` + `createTrigger.ts` + `deleteTrigger.ts` + `setTriggerEnabled.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`
- Test: `packages/backend/src/routes/agents/triggers/__tests__/createTrigger.test.ts`

**Interfaces:**
- Consumes: `triggerQueries`, shared `TriggerScheduleSchema`/`computeNextRunAt`/`applyJitter`, the singleton `TriggerScheduler` (from Task C5 wiring).
- Produces: `triggerRouter` (Express Router).

- [ ] **Step 1: Failing test — create validates body + computes next_run_at + arms a task**

Test `createTrigger` handler with a fake `insertTrigger` + fake scheduler: posting `{ tenantId, schedule: { mode:'recurring', recurring:{…} }, initialMessage:'hi' }` inserts a row with a future whole-second `next_run_at` and calls `scheduler.schedule` once; posting an empty `initialMessage` → 400.

- [ ] **Step 2: Run (FAIL), implement the handlers + router**

`createTrigger.ts`: `safeParse` the body (`z.object({ tenantId: z.string().min(1), schedule: TriggerScheduleSchema, initialMessage: z.string().min(1) })`). **App-generate the id** (`crypto.randomUUID()`) so jitter can be seeded before the insert and we write once: build the flat schedule input from the validated union, `const next = nextRunFor(scheduleInput, new Date(), id, jitterWindowMs)`, then a **single** `insertTrigger({ id, agentId, tenantId, orgId, …schedule columns…, initialMessage, nextRunAt: next })`, then `getTriggerScheduler().schedule({ runAt: next, payload: { triggerId: id, occurrenceEpoch: floor(next/1000), agentId, tenantId, initialMessage, schedule: scheduleInput } })` (skip when `next === null`, e.g. once-in-the-past / after-event), and return the `TriggerRow`. `listTriggers.ts`/`deleteTrigger.ts`/`setTriggerEnabled.ts` follow the handler-per-file style (each ≤40 lines). `deleteTrigger`/`setTriggerEnabled(disable)` call `getTriggerScheduler().cancel({ triggerId, occurrenceEpoch })` for the currently-armed occurrence (derive the epoch from the row's `next_run_at`); `setTriggerEnabled(enable)` recomputes + arms the next task. Import the scheduler via `getTriggerScheduler()` (created in Task C1, Step 5). `triggerRouter.ts`:
```ts
import express from 'express';
import { handleListTriggers } from './listTriggers.js';
import { handleCreateTrigger } from './createTrigger.js';
import { handleDeleteTrigger } from './deleteTrigger.js';
import { handleSetTriggerEnabled } from './setTriggerEnabled.js';
export const triggerRouter = express.Router({ mergeParams: true });
triggerRouter.get('/', handleListTriggers);
triggerRouter.post('/', handleCreateTrigger);
triggerRouter.delete('/:triggerId', handleDeleteTrigger);
triggerRouter.patch('/:triggerId/enabled', handleSetTriggerEnabled);
```

- [ ] **Step 3: Mount on agentRouter**

In `agentRouter.ts` add import and `agentRouter.use('/:agentId/triggers', triggerRouter);` (alongside the existing `vfsConfigRouter` mount).

- [ ] **Step 4: Run tests (PASS) + typecheck, commit**

```bash
git add packages/backend/src/routes/agents/triggers/ packages/backend/src/routes/agents/agentRouter.ts
git commit -m "feat(backend): trigger CRUD sub-router on agentRouter"
```

### Task C5: Internal fire route + allowlist

**Files:**
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`
- Modify: `packages/backend/src/server.ts`

(The scheduler singleton was created in Task C1, Step 5 — `getTriggerScheduler()` already exists.)

- [ ] **Step 2: Add the fire route**

In `internalRouter.ts`:
```ts
import { createFireHandler } from '../../triggers/fireHandler.js';
import { getTriggerScheduler } from '../../triggers/schedulerSingleton.js';
import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
const JITTER = Number(process.env.TRIGGER_JITTER_WINDOW_MS ?? '0');
const DEFAULT_USER = process.env.TRIGGER_DEFAULT_USER_ID ?? '';
const EXEC_TIMEOUT = Number(process.env.TRIGGER_EXEC_TIMEOUT_MS ?? '600000'); // 10 min
internalRouter.post('/triggers/fire', createFireHandler({
  supabase: createServiceClient(), scheduler: getTriggerScheduler(),
  jitterWindowMs: JITTER, defaultUserId: DEFAULT_USER, execTimeoutMs: EXEC_TIMEOUT,
}));
```

- [ ] **Step 3: Register in the gate allowlist**

In `server.ts`, add `'/internal/triggers/fire'` to the `SYSTEM_PUBLIC_UNAUTHED` array (next to `'/internal/embed'`) so `runGateCoverage` passes. (Auth is enforced by `requireInternalAuth` on the internal router; the path is exempt from the JWT gate, same as `/internal/embed`.)

- [ ] **Step 4: Typecheck + gate coverage test, commit**

Run: `npm run typecheck -w packages/backend`; `npm run test -w packages/backend` (server boots, gate coverage passes).
```bash
git add packages/backend/src/routes/internal/internalRouter.ts packages/backend/src/server.ts
git commit -m "feat(backend): /internal/triggers/fire route + gate allowlist"
```

---

## Phase D — Web: persistence wiring + two-step modal + toggle

### Task D1: lib/triggers + actions/triggers

**Files:**
- Create: `packages/web/app/lib/triggers.ts`
- Create: `packages/web/app/actions/triggers.ts`
- Test: `packages/web/app/lib/__tests__/triggers.test.ts`

**Interfaces:**
- Consumes: `fetchFromBackend` (`app/lib/backendProxy`), `serverLog`/`serverError`.
- Produces: `TriggerRow` (snake_case, same fields as backend), `listTriggers`/`createTrigger`/`deleteTrigger`/`setTriggerEnabled` lib fns (`{ result, error }`); matching `*Action` server actions.

- [ ] **Step 1: Failing test for `isTriggerRow` guard**, then implement `lib/triggers.ts` mirroring `lib/tenants.ts` (type guard, `extractError`, `fetchFromBackend('GET'|'POST'|'PATCH'|'DELETE', …)`), and `actions/triggers.ts` mirroring `actions/tenants.ts` (`'use server'`, `serverLog`/`serverError`). **Copy the `TriggerRow` field list verbatim from backend Task C2 / spec §3** (snake_case; add a comment `// keep in sync with packages/backend …/triggerQueries.ts`). Endpoints: `GET/POST /agents/:agentId/triggers`, `DELETE …/:id`, `PATCH …/:id/enabled`. The POST body is `{ tenantId, schedule: toTriggerSchedule(form), initialMessage: form.initialMessage }` (import `toTriggerSchedule` from the shared module to build the union from the flat form state).

- [ ] **Step 2: Run (PASS) + typecheck, commit**

```bash
git add packages/web/app/lib/triggers.ts packages/web/app/actions/triggers.ts packages/web/app/lib/__tests__/triggers.test.ts
git commit -m "feat(web): trigger lib + server actions (FE → backend proxy)"
```

### Task D2: i18n keys

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add keys under `editor.triggers`**

Add: `"next": "Next"`, `"back": "Back"`, `"create": "Create"`, `"messageStepTitle": "Initial message"`, `"messageLabel": "Message the agent will receive"`, `"messagePlaceholder": "e.g. Summarize today's new leads"`, `"listLoading": "Loading triggers…"`, `"listError": "Couldn't load triggers"`, `"enabledLabel": "Enabled"`, `"paused": "Paused"`, `"enableTrigger": "Enable"`, `"disableTrigger": "Pause"`, `"previewApproximate": "Actual run time may vary slightly"`.

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "i18n(web): trigger two-step modal + toggle copy"
```

### Task D3: Two-step modal

**Files:**
- Create: `packages/web/app/components/agents/triggers/ScheduleStep.tsx`, `MessageStep.tsx`, `StepFooter.tsx`
- Modify: `packages/web/app/components/agents/triggers/TriggerFormDialog.tsx`

- [ ] **Step 1: Extract `ScheduleStep.tsx`** — move the current `ModeSelector + ActiveContent + PreviewSection` body out of `TriggerFormDialog.tsx` into a `ScheduleStep` component taking `{ state, setState }`.

- [ ] **Step 2: Create `MessageStep.tsx`** — a `Label` + shadcn `Textarea` bound to `state.initialMessage`, plus the `previewApproximate` hint:
```tsx
'use client';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
export function MessageStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="trigger-message">{t('messageLabel')}</Label>
      <Textarea id="trigger-message" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('messagePlaceholder')} rows={5} />
      <span className="text-xs text-muted-foreground">{t('previewApproximate')}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create `StepFooter.tsx`** — renders `Cancel`·`Next` (schedule step) or `Back`·`Create` (message step, `Create` disabled when `messageEmpty`). Props `{ step, isEdit, messageEmpty, onCancel, onNext, onBack, onSave }`.

- [ ] **Step 4: Rewire `TriggerFormDialog.tsx`** — `FormBody` holds `state` + `step`; renders `<ScheduleStep>` or `<MessageStep>` and `<StepFooter>`; `Next` → `setStep('message')`, `Back` → `setStep('schedule')`, `Create` → `onSave(state)`. Keep each function ≤40 lines.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck -w packages/web`.
```bash
git add packages/web/app/components/agents/triggers/ScheduleStep.tsx packages/web/app/components/agents/triggers/MessageStep.tsx packages/web/app/components/agents/triggers/StepFooter.tsx packages/web/app/components/agents/triggers/TriggerFormDialog.tsx
git commit -m "feat(web): two-step trigger modal (schedule → message)"
```

### Task D4: async useTriggers + panel + row toggle + EditorTabs

**Files:**
- Rewrite: `packages/web/app/components/agents/triggers/useTriggers.ts`
- Modify: `TriggersPanel.tsx`, `TriggersListView.tsx`, `TriggerRow.tsx`, `EditorTabs.tsx`

**Interfaces:**
- Consumes: `*Action` from `app/actions/triggers`.
- Produces: `useTriggers(agentId, tenantId): { triggers, loading, error, addTrigger, deleteTrigger, setEnabled }`.

- [ ] **Step 1: Rewrite `useTriggers`** — load via `listTriggersAction(agentId, tenantId)` on mount / when `(agentId, tenantId)` change (guard empty); `addTrigger(form)` → `createTriggerAction` then append the returned row; `deleteTrigger(id)` → `deleteTriggerAction` then remove; `setEnabled(id, enabled)` → optimistic update + `setTriggerEnabledAction`, revert on error. Expose `loading`/`error`.

- [ ] **Step 2: `TriggersPanel.tsx`** — add `agentId` prop; pass to `PanelBody` → `useTriggers(agentId, tenantId)`; drop the edit-state path (`editing` becomes add-only: `null | { mode:'add' }`); render list loading/error.

- [ ] **Step 3: `TriggersListView.tsx` + `TriggerRow.tsx`** — remove `onEdit`; add a shadcn `Switch` bound to `enabled` (calls `setEnabled`); show `next_run_at`/`paused`/`last_status`; keep delete.

- [ ] **Step 4: `EditorTabs.tsx`** — change the render to `<TriggersPanel orgId={props.orgId} orgSlug={props.orgSlug} agentId={props.agentId} />`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck -w packages/web`.
```bash
git add packages/web/app/components/agents/triggers/useTriggers.ts packages/web/app/components/agents/triggers/TriggersPanel.tsx packages/web/app/components/agents/triggers/TriggersListView.tsx packages/web/app/components/agents/triggers/TriggerRow.tsx "packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/EditorTabs.tsx"
git commit -m "feat(web): persist triggers via backend; enabled toggle; thread agentId"
```

---

## Phase E — Verify

### Task E1: Full check + manual e2e

- [ ] **Step 1:** Run `npm run check` (format + lint + typecheck, all packages). Fix any ESLint 40/300 violations by extracting helpers (never line-compression).
- [ ] **Step 2:** Run `npm run test -w packages/backend` and `npm run test -w packages/shared-validation` — all green.
- [ ] **Step 3 (infra prerequisite — done by the user/ops before e2e):** Create the Cloud Tasks queue `agent-triggers` in `CLOUD_TASKS_LOCATION` with explicit `maxDispatchesPerSecond` + `maxConcurrentDispatches` (fleet-wide backpressure) and a retry config aligned to `TRIGGER_MAX_ATTEMPTS`; grant the `CLOUD_TASKS_SERVICE_ACCOUNT` permission to enqueue and to invoke the fire URL. Set the backend env from §6 (incl. `TRIGGER_EXEC_TIMEOUT_MS`). Document the `gcloud tasks queues create` command in the backend README.
- [ ] **Step 4 (manual e2e, after migrations applied + queue + env):** In the editor Triggers tab, create a `once` trigger ~1 min out with a message; confirm `Create` is disabled until the message is non-empty; confirm a row appears, Cloud Tasks fires once at the time, a session is created, one `trigger_runs` row exists, and `next_run_at` clears. Toggle a recurring trigger off → task cancelled, no fire. Confirm a run >10 min still records an outcome (no Cloud Tasks deadline hit, bounded by `TRIGGER_EXEC_TIMEOUT_MS`). Run two backend instances → fires land on either, no double-run.
- [ ] **Step 5: Commit any check fixes**

```bash
git add -A
git commit -m "chore: npm run check fixes for triggers feature"
```

---

## Self-Review notes (author)

- **Spec coverage:** shared math+jitter (A1) ✓; two-step modal (D3) ✓; persistence FE→proxy→BE (D1, C4) ✓; agent+tenant scope (B1, C2) ✓; event-driven Cloud Tasks fire (C1, C3, C5) ✓; fresh session + default user + prod version (C3) ✓; enabled toggle (C2, C4, D4) ✓; idempotency `UNIQUE(trigger_id, scheduled_for)` + `claim_and_rearm` (B2) ✓; whole-second occurrence identity (A1, C3) ✓; RLS service-only (B1, B2) ✓; i18n (D2) ✓; auth via `requireInternalAuth`+allowlist (C5) ✓; retention cron (B2) ✓.
- **Deferred (out of scope, per spec):** min-interval, per-org/agent caps, per-org budget/concurrency, after-event firing, reconciliation sweep, OIDC hardening, `>30d` re-arm-hop (note in code as a follow-up if a `once` >30d is created — for v1, reject or clamp in `createTrigger` validation and log).
- **Resolved (C3):** v1 awaits `executeAgentCore` in a **detached, timed-out** task (`withTimeout` / `TRIGGER_EXEC_TIMEOUT_MS`) — the 202 is returned immediately; the BE holds the edge SSE for the run (accepted, I/O-bound, bounded by the timeout). The no-hold path (pre-gen `executionId` + `getNotifier().waitForCompletion` on the Redis completion event) is the P2 optimization.
- **trigger_runs partitioning:** real daily range partitions + create-ahead/drop-old maintenance (`maintain_trigger_runs`, pg_cron) — chosen over a plain table to avoid a later migration of a live table; retention is DROP PARTITION, not DELETE.
- **Review rounds folded in:** claim-first ordering with the `enabled` gate inside `claim_and_rearm`; next-occurrence anchored on `scheduled_for` (idempotent re-arm); task-payload-driven fire (no pre-fire `getTriggerById`); app-generated trigger id (single INSERT, jitter seeded pre-insert); `getAgentById` for the fresh production version in the detached path; scheduler singleton created in C1 (before C4); single-source `TriggerRow`; queue provisioning prerequisite.
