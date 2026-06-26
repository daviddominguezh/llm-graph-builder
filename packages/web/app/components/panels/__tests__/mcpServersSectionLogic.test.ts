import { describe, expect, it } from '@jest/globals';

import { type SectionTenant, describeAggregateStatus, toMatrixTenants } from '../mcpServersSectionLogic';

describe('toMatrixTenants', () => {
  it('maps id/name/isDefault into MatrixTenant shape', () => {
    const tenants: SectionTenant[] = [
      { id: 't1', name: 'Default', isDefault: true, avatarUrl: 'https://x/a.png' },
      { id: 't2', name: 'Other', isDefault: false, avatarUrl: null },
    ];
    expect(toMatrixTenants(tenants)).toEqual([
      { id: 't1', name: 'Default', isDefault: true, avatarUrl: 'https://x/a.png' },
      { id: 't2', name: 'Other', isDefault: false, avatarUrl: null },
    ]);
  });

  it('returns an empty array for no tenants', () => {
    expect(toMatrixTenants([])).toEqual([]);
  });
});

describe('describeAggregateStatus', () => {
  it('maps ok to the green check', () => {
    expect(describeAggregateStatus('ok')).toEqual({ iconKind: 'ok', colorClassName: 'text-green-500' });
  });

  it('maps warning to the orange triangle', () => {
    expect(describeAggregateStatus('warning')).toEqual({
      iconKind: 'warning',
      colorClassName: 'text-orange-400',
    });
  });

  it('maps error to the destructive X', () => {
    expect(describeAggregateStatus('error')).toEqual({
      iconKind: 'error',
      colorClassName: 'text-destructive',
    });
  });
});
