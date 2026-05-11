import { describe, expect, it } from '@jest/globals';

import { isKvStoreRow } from './kvStoresQueries.js';

describe('isKvStoreRow', () => {
  it('accepts rows with required fields', () => {
    const row = { id: 'k1', org_id: 'o1', name: 'FAQs', slug: 'faqs',
      created_at: 't', updated_at: 't' };
    expect(isKvStoreRow(row)).toBe(true);
  });
  it('rejects rows missing slug', () => {
    expect(isKvStoreRow({ id: 'k1', org_id: 'o1', name: 'x' })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isKvStoreRow(undefined)).toBe(false);
  });
});
