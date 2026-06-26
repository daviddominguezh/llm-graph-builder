import { describe, expect, it } from '@jest/globals';

import { type TriggerRow, isTriggerRow } from '../triggers';

function makeRow(overrides: Partial<TriggerRow> = {}): TriggerRow {
  return {
    id: 'trg_1',
    agent_id: 'agent_1',
    tenant_id: 'tenant_1',
    org_id: 'org_1',
    mode: 'recurring',
    recurring: {
      unit: 'minutes',
      interval: 5,
      weekdays: ['mon'],
      dayOfMonth: 1,
      time: '09:00',
      startAt: '',
      endAt: '',
    },
    once_datetime: null,
    initial_message: 'hello',
    next_run_at: null,
    enabled: true,
    armed_task_epoch: null,
    run_count: 0,
    last_status: null,
    last_run_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isTriggerRow', () => {
  it('accepts a well-formed TriggerRow', () => {
    expect(isTriggerRow(makeRow())).toBe(true);
  });

  it('accepts a once-mode row with null recurring', () => {
    expect(
      isTriggerRow(makeRow({ mode: 'once', recurring: null, once_datetime: '2026-02-02T10:00:00.000Z' }))
    ).toBe(true);
  });

  it('rejects null and non-objects', () => {
    expect(isTriggerRow(null)).toBe(false);
    expect(isTriggerRow(undefined)).toBe(false);
    expect(isTriggerRow('trg_1')).toBe(false);
    expect(isTriggerRow(42)).toBe(false);
  });

  it('rejects objects missing required discriminator fields', () => {
    expect(isTriggerRow({})).toBe(false);
    expect(isTriggerRow({ id: 'x' })).toBe(false);
    expect(isTriggerRow({ id: 'x', agent_id: 'a', mode: 'recurring' })).toBe(false);
    expect(isTriggerRow({ id: 'x', agent_id: 'a', enabled: true })).toBe(false);
  });
});
