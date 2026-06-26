import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';

import type { SupabaseClient } from '../../../../db/queries/operationHelpers.js';
import type { TriggerRow } from '../../../../db/queries/triggerQueries.js';
import type { TriggerScheduler } from '../../../../triggers/scheduler.js';

const HTTP_OK = 200;
const AGENT_ID = 'agent-1';
const TRIGGER_ID = 'trigger-1';
const STALE_EPOCH = 100;
const FRESH_EPOCH = 200;
const ZERO = 0;
const ONE = 1;
const STALE_NEXT = '2026-06-25T09:00:00.000Z';
const FRESH_NEXT = '2026-06-26T09:00:00.000Z';
const ENABLE_ONCE_AT = '2099-01-01T09:00:00.000Z';

const noopScheduler: TriggerScheduler = {
  schedule: jest.fn<TriggerScheduler['schedule']>().mockResolvedValue(undefined),
  cancel: jest.fn<TriggerScheduler['cancel']>().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../../../triggers/schedulerSingleton.js', () => ({
  getTriggerScheduler: (): TriggerScheduler => noopScheduler,
}));

const setNextRunAtCalls: Array<{ triggerId: string; nextRunAt: Date | null }> = [];

const realQueries = await import('../../../../db/queries/triggerQueries.js');
jest.unstable_mockModule('../../../../db/queries/triggerQueries.js', () => ({
  ...realQueries,
  setTriggerEnabled: jest
    .fn<(typeof realQueries)['setTriggerEnabled']>()
    .mockResolvedValue({ error: null }),
  setArmedTaskEpoch: jest
    .fn<(typeof realQueries)['setArmedTaskEpoch']>()
    .mockResolvedValue(undefined),
  setNextRunAt: jest
    .fn<(typeof realQueries)['setNextRunAt']>()
    .mockImplementation(async (_supabase, triggerId, nextRunAt) => {
      await Promise.resolve();
      setNextRunAtCalls.push({ triggerId, nextRunAt });
    }),
}));

const { createSetTriggerEnabledHandler } = await import('../setTriggerEnabled.js');

function buildRow(overrides: Partial<TriggerRow>): TriggerRow {
  return {
    id: TRIGGER_ID,
    agent_id: AGENT_ID,
    tenant_id: 'tenant-1',
    org_id: 'org-1',
    mode: 'recurring',
    recurring: null,
    once_datetime: null,
    initial_message: 'hi',
    next_run_at: STALE_NEXT,
    enabled: true,
    armed_task_epoch: STALE_EPOCH,
    run_count: ZERO,
    last_status: null,
    last_run_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

type GetById = (s: SupabaseClient, id: string) => Promise<{ result: TriggerRow | null; error: string | null }>;

function twoStageGetTriggerById(stale: TriggerRow, fresh: TriggerRow): GetById {
  let call = ZERO;
  return async (): Promise<{ result: TriggerRow | null; error: string | null }> => {
    await Promise.resolve();
    call += ONE;
    return { result: call === ONE ? stale : fresh, error: null };
  };
}

const injectLocals: RequestHandler = (_req, res, next): void => {
  Object.assign(res.locals, { supabase: {} });
  next();
};

function buildApp(getTriggerById: GetById): express.Express {
  const app = express();
  app.use(express.json());
  app.use(injectLocals);
  app.patch(
    '/agents/:agentId/triggers/:triggerId/enabled',
    createSetTriggerEnabledHandler({ getTriggerById })
  );
  return app;
}

function onceRows(): { stale: TriggerRow; fresh: TriggerRow } {
  const base = { mode: 'once' as const, once_datetime: ENABLE_ONCE_AT };
  return {
    stale: buildRow({ ...base, enabled: false, next_run_at: STALE_NEXT }),
    fresh: buildRow({ ...base, enabled: true, next_run_at: ENABLE_ONCE_AT }),
  };
}

describe('setTriggerEnabled handler', () => {
  beforeEach(() => {
    setNextRunAtCalls.length = ZERO;
  });

  it('on enable, persists the freshly recomputed next_run_at and returns it', async () => {
    const { stale, fresh } = onceRows();
    const getTriggerById = twoStageGetTriggerById(stale, fresh);

    const res = await request(buildApp(getTriggerById))
      .patch(`/agents/${AGENT_ID}/triggers/${TRIGGER_ID}/enabled`)
      .send({ enabled: true });

    expect(res.status).toBe(HTTP_OK);
    expect(setNextRunAtCalls).toHaveLength(ONE);
    expect(setNextRunAtCalls[ZERO]?.triggerId).toBe(TRIGGER_ID);
    expect(setNextRunAtCalls[ZERO]?.nextRunAt?.toISOString()).toBe(ENABLE_ONCE_AT);
    expect(res.body).toMatchObject({ next_run_at: ENABLE_ONCE_AT, enabled: true });
  });

  it('returns the re-read row reflecting post-mutation next_run_at/armed_task_epoch', async () => {
    const stale = buildRow({});
    const fresh = buildRow({ enabled: false, next_run_at: FRESH_NEXT, armed_task_epoch: FRESH_EPOCH });
    const getTriggerById = twoStageGetTriggerById(stale, fresh);
    const app = express();
    app.use(express.json());
    app.use(injectLocals);
    app.patch(
      '/agents/:agentId/triggers/:triggerId/enabled',
      createSetTriggerEnabledHandler({ getTriggerById })
    );

    const res = await request(app)
      .patch(`/agents/${AGENT_ID}/triggers/${TRIGGER_ID}/enabled`)
      .send({ enabled: false });

    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toMatchObject({
      next_run_at: FRESH_NEXT,
      armed_task_epoch: FRESH_EPOCH,
      enabled: false,
    });
  });
});
