import { describe, expect, it } from '@jest/globals';

import { aggregateServerStatus, computeServerTenantStatus } from './mcpTenantStatus.js';

const base = { extractedVars: ['A'], resolvedValues: { A: 'x' }, currentHash: 'h' };

describe('computeServerTenantStatus', () => {
  it('is ok when all vars filled and discovery ok with matching hash', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'ok', valuesHash: 'h' } })).toBe('ok');
  });
  it('is pending when a var is empty', () => {
    expect(
      computeServerTenantStatus({
        ...base,
        resolvedValues: { A: '' },
        discovery: { status: 'ok', valuesHash: 'h' },
      })
    ).toBe('pending');
  });
  it('is pending when discovery hash is stale', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'ok', valuesHash: 'old' } })).toBe(
      'pending'
    );
  });
  it('is error when discovery errored and hash matches', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'error', valuesHash: 'h' } })).toBe(
      'error'
    );
  });
  it('is pending when there is no discovery row', () => {
    expect(computeServerTenantStatus({ ...base, discovery: undefined })).toBe('pending');
  });
});

describe('aggregateServerStatus', () => {
  it('ok only when all tenants ok', () => {
    expect(aggregateServerStatus(['ok', 'ok'])).toBe('ok');
  });
  it('error when any tenant errored', () => {
    expect(aggregateServerStatus(['ok', 'error', 'pending'])).toBe('error');
  });
  it('warning when some pending and none error', () => {
    expect(aggregateServerStatus(['ok', 'pending'])).toBe('warning');
  });
});
