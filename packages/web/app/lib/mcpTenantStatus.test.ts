import { describe, expect, it } from '@jest/globals';

import {
  type ServerTenantStatus,
  type TenantStatusArgs,
  aggregateServerStatus,
  buildCellResolvedValues,
  canonicalizeVariableValues,
  computeServerTenantStatus,
} from './mcpTenantStatus';

const base = { extractedVars: ['A'], resolvedValues: { A: 'x' }, currentHash: 'h' };

function status(overrides: Partial<TenantStatusArgs>): ServerTenantStatus {
  return computeServerTenantStatus({ ...base, discovery: undefined, ...overrides });
}

describe('computeServerTenantStatus (mirror of backend Task 4)', () => {
  it('is ok when all vars filled and discovery ok with matching hash', () => {
    expect(status({ discovery: { status: 'ok', valuesHash: 'h' } })).toBe('ok');
  });
  it('is pending when a var is empty', () => {
    expect(status({ resolvedValues: { A: '' }, discovery: { status: 'ok', valuesHash: 'h' } })).toBe(
      'pending'
    );
  });
  it('is pending when a var is missing entirely', () => {
    expect(status({ resolvedValues: {}, discovery: { status: 'ok', valuesHash: 'h' } })).toBe('pending');
  });
  it('is pending when discovery hash is stale', () => {
    expect(status({ discovery: { status: 'ok', valuesHash: 'old' } })).toBe('pending');
  });
  it('is pending when discovery hash is null', () => {
    expect(status({ discovery: { status: 'error', valuesHash: null } })).toBe('pending');
  });
  it('is error when discovery errored and hash matches', () => {
    expect(status({ discovery: { status: 'error', valuesHash: 'h' } })).toBe('error');
  });
  it('is pending when there is no discovery row', () => {
    expect(status({ discovery: undefined })).toBe('pending');
  });
});

describe('aggregateServerStatus (mirror of backend Task 4)', () => {
  it('ok only when all tenants ok', () => {
    expect(aggregateServerStatus(['ok', 'ok'])).toBe('ok');
  });
  it('error when any tenant errored', () => {
    expect(aggregateServerStatus(['ok', 'error', 'pending'])).toBe('error');
  });
  it('warning when some pending and none error', () => {
    expect(aggregateServerStatus(['ok', 'pending'])).toBe('warning');
  });
  it('warning when the tenant array is empty (NOT ok)', () => {
    expect(aggregateServerStatus([])).toBe('warning');
  });
});

describe('canonicalizeVariableValues', () => {
  it('is stable regardless of key order', () => {
    const a = canonicalizeVariableValues({
      B: { type: 'direct', value: '2' },
      A: { type: 'direct', value: '1' },
    });
    const b = canonicalizeVariableValues({
      A: { type: 'direct', value: '1' },
      B: { type: 'direct', value: '2' },
    });
    expect(a).toBe(b);
  });
  it('changes when a value changes', () => {
    const a = canonicalizeVariableValues({ A: { type: 'direct', value: '1' } });
    const b = canonicalizeVariableValues({ A: { type: 'direct', value: '2' } });
    expect(a).not.toBe(b);
  });
  it('matches the backend canonical form: JSON of sorted [key, value] pairs', () => {
    const out = canonicalizeVariableValues({
      B: { type: 'direct', value: '2' },
      A: { type: 'direct', value: '1' },
    });
    expect(out).toBe(
      JSON.stringify([
        ['A', { type: 'direct', value: '1' }],
        ['B', { type: 'direct', value: '2' }],
      ])
    );
  });
});

describe('buildCellResolvedValues', () => {
  it('resolves direct values to their literal value', () => {
    const out = buildCellResolvedValues({ A: { type: 'direct', value: 'x' } }, { id1: 'NAME' });
    expect(out).toEqual({ A: 'x' });
  });
  it('treats a selected env_ref as filled via the env-name sentinel', () => {
    const out = buildCellResolvedValues({ A: { type: 'env_ref', envVariableId: 'id1' } }, { id1: 'NAME' });
    expect(out.A).not.toBe('');
  });
  it('treats an env_ref with no selection as empty', () => {
    const out = buildCellResolvedValues({ A: { type: 'env_ref', envVariableId: '' } }, {});
    expect(out.A).toBe('');
  });
  it('treats a direct empty value as empty', () => {
    const out = buildCellResolvedValues({ A: { type: 'direct', value: '' } }, {});
    expect(out.A).toBe('');
  });
});
