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
