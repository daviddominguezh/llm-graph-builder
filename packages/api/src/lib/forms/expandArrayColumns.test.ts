import { describe, expect, it } from '@jest/globals';

import { ARRAY_EXPANSION_CAP, expandArrayColumns } from './expandArrayColumns.js';

const OBSERVED_MAX_SINGLE = 3;
const INDEX_ZERO = 0;
const INDEX_ONE = 1;
const INDEX_TWO = 2;
const OVERFLOW_OFFSET = 5;
const OFFSET_FOR_LENGTH = 1;
const EXPECTED_LENGTH_WITH_OVERFLOW = ARRAY_EXPANSION_CAP + OFFSET_FOR_LENGTH;
const OBSERVED_MAX_MULTI_DIM = 10;

describe('expandArrayColumns', () => {
  it('expands single slot up to observed max', () => {
    const r = expandArrayColumns(['a[].b'], { 'a[].b': OBSERVED_MAX_SINGLE });
    expect(r.columns).toEqual([
      `a[${String(INDEX_ZERO)}].b`,
      `a[${String(INDEX_ONE)}].b`,
      `a[${String(INDEX_TWO)}].b`,
    ]);
    expect(r.truncated).toBe(false);
  });

  it('caps expansion at ARRAY_EXPANSION_CAP', () => {
    const r = expandArrayColumns(['a[]'], { 'a[]': ARRAY_EXPANSION_CAP + OVERFLOW_OFFSET });
    expect(r.columns).toHaveLength(EXPECTED_LENGTH_WITH_OVERFLOW);
    expect(r.columns[ARRAY_EXPANSION_CAP]).toBe(`a[${String(ARRAY_EXPANSION_CAP)}+]`);
    expect(r.truncated).toBe(true);
  });

  it('multi-dim caps TOTAL columns per path, not per dimension', () => {
    const r = expandArrayColumns(['m[][]'], { 'm[][]': OBSERVED_MAX_MULTI_DIM });
    expect(r.columns.length).toBeLessThanOrEqual(EXPECTED_LENGTH_WITH_OVERFLOW);
  });
});
