import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { SupabaseClient } from '../../../../db/queries/operationHelpers.js';
import type { InsertTriggerParams, TriggerRow } from '../../../../db/queries/triggerQueries.js';
import type { ScheduleInput, TriggerScheduler } from '../../../../triggers/scheduler.js';
import { type CreateTriggerDeps, createCreateTriggerHandler } from '../createTrigger.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const ONE = 1;
const ZERO = 0;
const MS = 1000;
const ORG_ID = 'org-1';
const AGENT_ID = 'agent-1';

const makeSupabase = jest.fn<() => SupabaseClient>();

interface SchedulerSpy {
  scheduler: TriggerScheduler;
  calls: ScheduleInput[];
}

function spyScheduler(): SchedulerSpy {
  const calls: ScheduleInput[] = [];
  const scheduler: TriggerScheduler = {
    schedule: async (input): Promise<void> => {
      await Promise.resolve();
      calls.push(input);
    },
    cancel: async (): Promise<void> => {
      await Promise.resolve();
    },
  };
  return { scheduler, calls };
}

type InsertFn = (s: SupabaseClient, p: InsertTriggerParams) => Promise<{ result: TriggerRow; error: null }>;

interface InsertSpy {
  insertTrigger: InsertFn;
  calls: InsertTriggerParams[];
}

function buildRow(p: InsertTriggerParams): TriggerRow {
  return {
    id: p.id ?? 'generated-id',
    agent_id: p.agentId,
    tenant_id: p.tenantId,
    org_id: p.orgId,
    mode: p.schedule.mode,
    recurring: p.schedule.mode === 'recurring' ? p.schedule.recurring : null,
    once_datetime: p.schedule.mode === 'once' ? p.schedule.onceDateTime : null,
    initial_message: p.initialMessage,
    next_run_at: p.nextRunAt === null ? null : p.nextRunAt.toISOString(),
    enabled: true,
    armed_task_epoch: p.armedTaskEpoch,
    run_count: ZERO,
    last_status: null,
    last_run_at: null,
    created_at: new Date().toISOString(),
  };
}

function spyInsert(): InsertSpy {
  const calls: InsertTriggerParams[] = [];
  const insertTrigger: InsertFn = async (_s, p) => {
    await Promise.resolve();
    calls.push(p);
    return { result: buildRow(p), error: null };
  };
  return { calls, insertTrigger };
}

const getAgentById = async (): Promise<{ result: { org_id: string }; error: null }> => {
  await Promise.resolve();
  return { result: { org_id: ORG_ID }, error: null };
};

const setArmedTaskEpoch = async (): Promise<void> => {
  await Promise.resolve();
};

function recurringBody(initialMessage = 'hi'): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    initialMessage,
    schedule: {
      mode: 'recurring',
      recurring: {
        unit: 'days',
        interval: ONE,
        weekdays: [],
        dayOfMonth: ONE,
        time: '09:00',
        startAt: '',
        endAt: '',
      },
    },
  };
}

function buildApp(deps: CreateTriggerDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/agents/:agentId/triggers', createCreateTriggerHandler(deps));
  return app;
}

function deps(insert: InsertSpy, sched: SchedulerSpy): CreateTriggerDeps {
  return {
    supabase: makeSupabase(),
    scheduler: sched.scheduler,
    insertTrigger: insert.insertTrigger,
    getAgentById,
    setArmedTaskEpoch,
  };
}

describe('createTrigger handler', () => {
  it('inserts a row with a future whole-second next_run_at and arms one task', async () => {
    const insert = spyInsert();
    const sched = spyScheduler();
    const app = buildApp(deps(insert, sched));

    const res = await request(app).post(`/agents/${AGENT_ID}/triggers`).send(recurringBody());

    expect(res.status).toBe(HTTP_OK);
    expect(insert.calls).toHaveLength(ONE);
    const params = insert.calls.at(ZERO);
    expect(params?.orgId).toBe(ORG_ID);
    expect(typeof params?.id).toBe('string');
    const next = params?.nextRunAt ?? null;
    expect(next).not.toBeNull();
    const nextMs = next === null ? ZERO : next.getTime();
    expect(nextMs).toBeGreaterThan(Date.now());
    expect(nextMs % MS).toBe(ZERO);
    expect(sched.calls).toHaveLength(ONE);
  });

  it('rejects an empty initialMessage with 400 and no insert', async () => {
    const insert = spyInsert();
    const sched = spyScheduler();
    const app = buildApp(deps(insert, sched));

    const res = await request(app).post(`/agents/${AGENT_ID}/triggers`).send(recurringBody(''));

    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(insert.calls).toHaveLength(ZERO);
    expect(sched.calls).toHaveLength(ZERO);
  });
});
