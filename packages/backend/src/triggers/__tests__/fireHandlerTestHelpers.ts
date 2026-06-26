import { jest } from '@jest/globals';
import express from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { AgentExecutionInput } from '../../routes/execute/executeTypes.js';
import { type FireDeps, createFireHandler } from '../fireHandler.js';
import type { ScheduleInput, TriggerScheduler, TriggerTaskPayload } from '../scheduler.js';

/* ─── Constants ─── */

export const TARGET_EPOCH = 1782637200; // whole-second UTC occurrence
const RECURRING_INTERVAL = 5;
const RECURRING_DAY_OF_MONTH = 1;
export const MS = 1000;
export const HALF = 2;
export const FAR_HOPS = 3;
export const HORIZON_MS = 3_600_000; // 1h
const JITTER_MS = 0;
const EXEC_TIMEOUT_MS = 5000;
export const HOP_GAP = 99_999;
const AGENT_VERSION = 7;
export const HTTP_OK = 200;
export const HTTP_ACCEPTED = 202;
export const HTTP_BAD_REQUEST = 400;
export const ONE = 1;
export const ZERO = 0;
export const FIRST = 0;

const makeSupabase = jest.fn<() => SupabaseClient>();

export function fakeSupabase(): SupabaseClient {
  return makeSupabase();
}

export function makePayload(overrides: Partial<TriggerTaskPayload> = {}): TriggerTaskPayload {
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

export interface FakeScheduler {
  scheduler: TriggerScheduler;
  calls: ScheduleInput[];
  order: string[];
}

export function fakeScheduler(order: string[] = []): FakeScheduler {
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

export interface ArmedRecorder {
  setArmedTaskEpoch: FireDeps['setArmedTaskEpoch'];
  armed: Array<number | null>;
}

export function armedRecorder(): ArmedRecorder {
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

export interface Recorder {
  claimCalls: number;
  execCalls: number;
  recorded: string[];
  lastInput: AgentExecutionInput | null;
  ran: Promise<true>;
}

export interface FakeOpts {
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

export function fakeDeps(scheduler: TriggerScheduler, opts: FakeOpts): { deps: FireDeps; rec: Recorder } {
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

export function appWith(deps: FireDeps): express.Express {
  const app = express();
  app.use(express.json());
  const handler = createFireHandler(deps);
  app.post('/internal/triggers/fire', (req, res) => {
    void handler(req, res);
  });
  return app;
}
