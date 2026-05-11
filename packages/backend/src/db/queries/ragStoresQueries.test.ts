import { describe, expect, it } from '@jest/globals';

import { isRagStoreRow } from './ragStoresQueries.js';

describe('isRagStoreRow', () => {
  it('accepts rows with required fields', () => {
    const row = {
      id: 'r1', org_id: 'o1', name: 'Products', slug: 'products',
      created_at: 't', updated_at: 't',
    };
    expect(isRagStoreRow(row)).toBe(true);
  });
  it('rejects rows missing org_id', () => {
    expect(isRagStoreRow({ id: 'r1', name: 'x', slug: 'x' })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isRagStoreRow(null)).toBe(false);
    expect(isRagStoreRow('x')).toBe(false);
  });
});
