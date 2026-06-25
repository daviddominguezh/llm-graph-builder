import { expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { AgentExecutionInput } from '../../routes/execute/executeTypes.js';
import { type FireDeps, createFireHandler } from '../fireHandler.js';
import { armToward, buildTriggerInput } from '../fireHelpers.js';
import type { ScheduleInput, TriggerScheduler, TriggerTaskPayload } from '../scheduler.js';

/* ─── Constants ─── */

const TARGET_EPOCH = 1782637200; // whole-second UTC occurrence
const RECURRING_INTERVAL = 5;
const RECURRING_DAY_OF_MONTH = 1;
const MS = 1000;
const HALF = 2;
const FAR_HOPS = 3;
const HORIZON_MS = 3_600_000; // 1h
const JITTER_MS = 0;
const EXEC_TIMEOUT_MS = 5000;
const HOP_GAP = 99_999;
const AGENT_VERSION = 7;
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const ONE = 1;
const ZERO = 0;
const FIRST = 0;

const makeSupabase = jest.fn<() => SupabaseClient>();

function fakeSupabase(): SupabaseClient {
  return makeSupabase();
}

function makePayload(overrides: Partial<TriggerTaskPayload> = {}): TriggerTaskPayload {
  return {
    triggerId: 't1',
    targetEpoch: TARGET_EPOCH,
    hopEpoch: TARGET_EPOCH,
    agentId: 'a1',
    tenantId: 'te1',
    initialMessage: 'hello',
    schedule: {
      mode: 'once',
      onceDateTime: '',
      recurring: {
        unit: 'minutes',
        interval: RECURRING_INTERVAL,
        weekdays: [],
        dayOfMonth: RECURRING_DAY_OF_MONTH,
        time: '09:00',
        startAt: '',
        endAt: '',
      },
    },
    ...overrides,
  };
}

/* ─── Fake scheduler ─── */

interface FakeScheduler {
  scheduler: TriggerScheduler;
  calls: ScheduleInput[];
  order: string[];
}

function fakeScheduler(order: string[] = []): FakeScheduler {
  const calls: ScheduleInput[] = [];
  const scheduler: TriggerScheduler = {
    schedule: async (input: ScheduleInput): Promise<void> => {
      await Promise.resolve();
      order.push('schedule');
      calls.push(input);
    },
    cancel: async (): Promise<void> => {
      await Promise.resolve();
    },
  };
  return { scheduler, calls, order };
}

/* ─── Fake setArmedTaskEpoch ─── */

interface ArmedRecorder {
  setArmedTaskEpoch: FireDeps['setArmedTaskEpoch'];
  armed: Array<number | null>;
}

function armedRecorder(): ArmedRecorder {
  const armed: Array<number | null> = [];
  return {
    armed,
    setArmedTaskEpoch: async (_s, _t, epoch): Promise<void> => {
      await Promise.resolve();
      armed.push(epoch);
    },
  };
}

/* ─── Fake query/exec seam ─── */

interface Recorder {
  claimCalls: number;
  execCalls: number;
  recorded: string[];
  lastInput: AgentExecutionInput | null;
  ran: Promise<true>;
}

interface FakeOpts {
  claimResult: { runId: string; sessionId: string } | null;
  enabled: boolean;
  order: string[];
}

interface ClaimResult {
  result: { runId: string; sessionId: string } | null;
  error: string | null;
}
interface AgentResult {
  result: { org_id: string; current_version: number } | null;
  error: string | null;
}

function buildSeam(opts: FakeOpts): { seam: Partial<FireDeps>; rec: Recorder } {
  const { promise: ran, resolve: markRan } = Promise.withResolvers<true>();
  const rec: Recorder = { claimCalls: ZERO, execCalls: ZERO, recorded: [], lastInput: null, ran };
  const seam: Partial<FireDeps> = {
    execute: async (_ctx, input): Promise<void> => {
      await Promise.resolve();
      rec.execCalls += ONE;
      rec.lastInput = input;
    },
    claimAndRearm: async (): Promise<ClaimResult> => {
      await Promise.resolve();
      opts.order.push('claim');
      rec.claimCalls += ONE;
      return { result: opts.claimResult, error: null };
    },
    recordOutcome: async (_s, outcome): Promise<{ error: string | null }> => {
      await Promise.resolve();
      rec.recorded.push(outcome.status);
      markRan(true);
      return { error: null };
    },
    isTriggerEnabled: async (): Promise<boolean> => {
      await Promise.resolve();
      return opts.enabled;
    },
    setArmedTaskEpoch: async (): Promise<void> => {
      await Promise.resolve();
    },
    getAgentById: async (): Promise<AgentResult> => {
      await Promise.resolve();
      return { result: { org_id: 'org1', current_version: AGENT_VERSION }, error: null };
    },
  };
  return { seam, rec };
}

function fakeDeps(scheduler: TriggerScheduler, opts: FakeOpts): { deps: FireDeps; rec: Recorder } {
  const { seam, rec } = buildSeam(opts);
  const deps: FireDeps = {
    supabase: fakeSupabase(),
    scheduler,
    defaultUserId: 'user-default',
    jitterWindowMs: JITTER_MS,
    execTimeoutMs: EXEC_TIMEOUT_MS,
    horizonMs: HORIZON_MS,
    ...seam,
  };
  return { deps, rec };
}

function appWith(deps: FireDeps): express.Express {
  const app = express();
  app.use(express.json());
  const handler = createFireHandler(deps);
  app.post('/internal/triggers/fire', (req, res) => {
    void handler(req, res);
  });
  return app;
}

/* ─── buildTriggerInput ─── */

it('builds an api-channel, non-streaming input with default user + fresh session', () => {
  const input = buildTriggerInput(makePayload(), 'sess-1', 'user-default');
  expect(input).toMatchObject({
    tenantId: 'te1',
    userId: 'user-default',
    sessionId: 'sess-1',
    message: { text: 'hello' },
    channel: 'api',
    stream: false,
  });
});

/* ─── armToward ─── */

it('arms the real fire when the target is within the horizon', async () => {
  const { scheduler, calls } = fakeScheduler();
  const { setArmedTaskEpoch, armed } = armedRecorder();
  const now = new Date(TARGET_EPOCH * MS - HORIZON_MS / HALF);
  await armToward(
    { supabase: fakeSupabase(), scheduler, horizonMs: HORIZON_MS, setArmedTaskEpoch },
    makePayload(),
    TARGET_EPOCH,
    now
  );
  expect(calls).toHaveLength(ONE);
  const [call] = calls;
  expect(call?.payload.hopEpoch).toBe(TARGET_EPOCH);
  expect(call?.payload.targetEpoch).toBe(TARGET_EPOCH);
  expect(call?.runAt.getTime()).toBe(TARGET_EPOCH * MS);
  expect(armed).toEqual([TARGET_EPOCH]);
});

it('arms a continuation hop when the target is beyond the horizon', async () => {
  const { scheduler, calls } = fakeScheduler();
  const { setArmedTaskEpoch, armed } = armedRecorder();
  const now = new Date(TARGET_EPOCH * MS - HORIZON_MS * FAR_HOPS);
  const expectedHop = Math.floor((now.getTime() + HORIZON_MS) / MS);
  await armToward(
    { supabase: fakeSupabase(), scheduler, horizonMs: HORIZON_MS, setArmedTaskEpoch },
    makePayload(),
    TARGET_EPOCH,
    now
  );
  const [call] = calls;
  expect(call?.payload.hopEpoch).toBe(expectedHop);
  expect(call?.payload.hopEpoch).toBeLessThan(TARGET_EPOCH);
  expect(call?.payload.targetEpoch).toBe(TARGET_EPOCH);
  expect(call?.runAt.getTime()).toBe(now.getTime() + HORIZON_MS);
  expect(armed).toEqual([expectedHop]);
});

/* ─── handler: real fire ─── */

it('claims before scheduling, arms the next occurrence, and responds 202 on a real fire', async () => {
  const order: string[] = [];
  const { scheduler } = fakeScheduler(order);
  const recurring = makePayload();
  recurring.schedule.mode = 'recurring';
  const { deps, rec } = fakeDeps(scheduler, {
    claimResult: { runId: 'run1', sessionId: 'sess1' },
    enabled: true,
    order,
  });
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(recurring);
  expect(res.status).toBe(HTTP_ACCEPTED);
  expect(order[FIRST]).toBe('claim');
  expect(order).toContain('schedule');
  await rec.ran;
  expect(rec.execCalls).toBe(ONE);
  expect(rec.recorded).toEqual(['succeeded']);
});

it('responds 200 and does not schedule or execute when the claim returns null', async () => {
  const order: string[] = [];
  const { scheduler, calls } = fakeScheduler(order);
  const recurring = makePayload();
  recurring.schedule.mode = 'recurring';
  const { deps, rec } = fakeDeps(scheduler, { claimResult: null, enabled: true, order });
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(recurring);
  expect(res.status).toBe(HTTP_OK);
  expect(calls).toHaveLength(ZERO);
  expect(rec.execCalls).toBe(ZERO);
});

it('rejects an invalid body with 400 without claiming', async () => {
  const order: string[] = [];
  const { scheduler } = fakeScheduler(order);
  const { deps, rec } = fakeDeps(scheduler, { claimResult: null, enabled: true, order });
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send({ triggerId: 't1' });
  expect(res.status).toBe(HTTP_BAD_REQUEST);
  expect(rec.claimCalls).toBe(ZERO);
});

/* ─── handler: continuation ─── */

it('on a continuation, does not claim/run and arms toward the target when enabled', async () => {
  const order: string[] = [];
  const { scheduler, calls } = fakeScheduler(order);
  const payload = makePayload({ hopEpoch: TARGET_EPOCH - HOP_GAP });
  const { deps, rec } = fakeDeps(scheduler, { claimResult: null, enabled: true, order });
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(payload);
  expect(res.status).toBe(HTTP_OK);
  expect(res.body).toMatchObject({ continuation: true });
  expect(rec.claimCalls).toBe(ZERO);
  expect(rec.execCalls).toBe(ZERO);
  expect(calls).toHaveLength(ONE);
  expect(calls[FIRST]?.payload.targetEpoch).toBe(TARGET_EPOCH);
});

it('on a continuation for a disabled trigger, arms nothing', async () => {
  const order: string[] = [];
  const { scheduler, calls } = fakeScheduler(order);
  const payload = makePayload({ hopEpoch: TARGET_EPOCH - HOP_GAP });
  const { deps } = fakeDeps(scheduler, { claimResult: null, enabled: false, order });
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(payload);
  expect(res.status).toBe(HTTP_OK);
  expect(calls).toHaveLength(ZERO);
});
