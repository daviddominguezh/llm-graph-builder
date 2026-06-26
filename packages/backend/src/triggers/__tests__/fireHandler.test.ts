import { expect, it } from '@jest/globals';
import request from 'supertest';

import type { FireDeps } from '../fireHandler.js';
import { armToward, buildTriggerInput } from '../fireHelpers.js';
import type { ScheduleInput, TriggerTaskPayload } from '../scheduler.js';
import {
  FAR_HOPS,
  FIRST,
  HALF,
  HOP_GAP,
  HORIZON_MS,
  HTTP_ACCEPTED,
  HTTP_BAD_REQUEST,
  HTTP_OK,
  MS,
  ONE,
  type Recorder,
  TARGET_EPOCH,
  ZERO,
  appWith,
  armedRecorder,
  fakeDeps,
  fakeScheduler,
  fakeSupabase,
  makePayload,
} from './fireHandlerTestHelpers.js';

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

function recurringFire(order: string[]): { deps: FireDeps; rec: Recorder; payload: TriggerTaskPayload } {
  const { scheduler } = fakeScheduler(order);
  const payload = makePayload();
  payload.schedule.mode = 'recurring';
  const claimResult = { runId: 'run1', sessionId: 'sess1' };
  const { deps, rec } = fakeDeps(scheduler, { claimResult, enabled: true, order });
  return { deps, rec, payload };
}

it('claims before scheduling, arms the next occurrence, and responds 202 on a real fire', async () => {
  const order: string[] = [];
  const { deps, rec, payload } = recurringFire(order);
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(payload);
  expect(res.status).toBe(HTTP_ACCEPTED);
  expect(order[FIRST]).toBe('claim');
  expect(order).toContain('schedule');
  await rec.ran;
  expect(rec.execCalls).toBe(ONE);
  expect(rec.recorded).toEqual(['succeeded']);
});

it('records a failed outcome when execute rejects (timeout/failure path)', async () => {
  const order: string[] = [];
  const { deps, rec, payload } = recurringFire(order);
  deps.execute = async (): Promise<void> => {
    await Promise.resolve();
    rec.execCalls += ONE;
    throw new Error('boom');
  };
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(payload);
  expect(res.status).toBe(HTTP_ACCEPTED);
  await rec.ran;
  expect(rec.execCalls).toBe(ONE);
  expect(rec.recorded).toEqual(['failed']);
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

function continuationFire(enabled: boolean): { deps: FireDeps; rec: Recorder; calls: ScheduleInput[] } {
  const order: string[] = [];
  const { scheduler, calls } = fakeScheduler(order);
  const { deps, rec } = fakeDeps(scheduler, { claimResult: null, enabled, order });
  return { deps, rec, calls };
}

const continuationPayload = makePayload({ hopEpoch: TARGET_EPOCH - HOP_GAP });

it('on a continuation, does not claim/run and arms toward the target when enabled', async () => {
  const { deps, rec, calls } = continuationFire(true);
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(continuationPayload);
  expect(res.status).toBe(HTTP_OK);
  expect(res.body).toMatchObject({ continuation: true });
  expect(rec.claimCalls).toBe(ZERO);
  expect(rec.execCalls).toBe(ZERO);
  expect(calls).toHaveLength(ONE);
  expect(calls[FIRST]?.payload.targetEpoch).toBe(TARGET_EPOCH);
});

it('on a continuation for a disabled trigger, arms nothing', async () => {
  const { deps, calls } = continuationFire(false);
  const res = await request(appWith(deps)).post('/internal/triggers/fire').send(continuationPayload);
  expect(res.status).toBe(HTTP_OK);
  expect(calls).toHaveLength(ZERO);
});
