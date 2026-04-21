import { describe, expect, it } from '@jest/globals';

import { mockCatalog, pickMockResponse } from './mockCatalog.js';

const EXPECTED_ENTRIES = 4;
const DISTRIBUTION_SAMPLE = 20;
const MIN_DISTINCT_BUCKETS = 1;
const MIN_BLOCKS_PER_ENTRY = 1;

describe('mockCatalog', () => {
  it('has 4 responses with at least one block each', () => {
    expect(mockCatalog).toHaveLength(EXPECTED_ENTRIES);
    for (const entry of mockCatalog) {
      expect(entry.blocks.length).toBeGreaterThanOrEqual(MIN_BLOCKS_PER_ENTRY);
    }
  });
  it('pickMockResponse is deterministic per sessionId', () => {
    const a = pickMockResponse('sess-1');
    const b = pickMockResponse('sess-1');
    expect(a).toBe(b);
  });
  it('distributes across entries', () => {
    const seen = new Set(
      Array.from({ length: DISTRIBUTION_SAMPLE }, (_, i) => pickMockResponse(`sess-${String(i)}`))
    );
    expect(seen.size).toBeGreaterThan(MIN_DISTINCT_BUCKETS);
  });
});
