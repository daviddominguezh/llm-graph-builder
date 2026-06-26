import { describe, expect, it } from '@jest/globals';

import { MAX_CACHE_VALUE_BYTES, isCacheableSize, mcpToolsListKey } from '../mcpToolsListCache.js';

const ONE_BYTE_OVER = 1;

describe('mcpToolsListKey', () => {
  it('builds the canonical key with version', () => {
    expect(mcpToolsListKey('org-1', 'abc123', '2.4.1')).toBe('mcp_tools:v1:org-1:abc123:2.4.1');
  });

  it('uses v0 sentinel for empty version', () => {
    expect(mcpToolsListKey('org-1', 'abc123', '')).toBe('mcp_tools:v1:org-1:abc123:v0');
  });
});

describe('isCacheableSize', () => {
  it('accepts small values', () => {
    expect(isCacheableSize(JSON.stringify({ tools: [] }))).toBe(true);
  });

  it('rejects values over the byte limit', () => {
    const big = 'x'.repeat(MAX_CACHE_VALUE_BYTES + ONE_BYTE_OVER);
    expect(isCacheableSize(big)).toBe(false);
  });
});
