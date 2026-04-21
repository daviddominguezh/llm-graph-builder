import { describe, it, expect } from '@jest/globals';

import { mockCatalog, pickMockResponse } from './mockCatalog.js';

describe('mockCatalog', () => {
  it('has 4 responses with at least one block each', () => {
    expect(mockCatalog).toHaveLength(4);
    for (const entry of mockCatalog) expect(entry.blocks.length).toBeGreaterThan(0);
  });
  it('pickMockResponse is deterministic per sessionId', () => {
    const a = pickMockResponse('sess-1');
    const b = pickMockResponse('sess-1');
    expect(a).toBe(b);
  });
  it('distributes across entries', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => pickMockResponse(`sess-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
