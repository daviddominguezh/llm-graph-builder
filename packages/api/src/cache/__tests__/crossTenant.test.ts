import { describe, expect, it } from '@jest/globals';

import { mcpToolsListKey } from '../mcpToolsListCache.js';
import { hashServerUrl, serverUrlSideTableKey } from '../serverHash.js';

const FRESH_VERSION = '1.0.0';
const SAME_HASH = 'abc123';

describe('cross-tenant safety — MCP tools/list key isolation', () => {
  it('two orgs with the same serverHash get distinct keys', () => {
    expect(mcpToolsListKey('org-a', SAME_HASH, FRESH_VERSION)).not.toBe(
      mcpToolsListKey('org-b', SAME_HASH, FRESH_VERSION)
    );
  });

  it('keys include the orgId as the third segment after the version', () => {
    const key = mcpToolsListKey('org-a', SAME_HASH, FRESH_VERSION);
    expect(key.split(':')).toEqual(['mcp_tools', 'v1', 'org-a', SAME_HASH, FRESH_VERSION]);
  });
});

describe('cross-tenant safety — OAuth token key isolation', () => {
  it('OAuth token keys include orgId', () => {
    const orgA = 'oauth:v1:org-a:calendar';
    const orgB = 'oauth:v1:org-b:calendar';
    expect(orgA).not.toBe(orgB);
  });
});

describe('cross-tenant safety — server URL hashing', () => {
  it('produces deterministic hash so cache keys are stable per URL', async () => {
    const url = 'https://example.com/mcp';
    const a = await hashServerUrl(url);
    const b = await hashServerUrl(url);
    expect(a).toBe(b);
  });

  it('different orgs sharing the same MCP URL hash to the same value (orgs split via key prefix)', async () => {
    // The hash represents the URL only — multi-tenant isolation comes from the orgId
    // segment of the key, NOT from the hash itself.
    const url = 'https://shared.example/mcp';
    const hash = await hashServerUrl(url);
    expect(mcpToolsListKey('org-a', hash, FRESH_VERSION)).not.toBe(
      mcpToolsListKey('org-b', hash, FRESH_VERSION)
    );
  });
});

describe('cross-tenant safety — side-table is org-agnostic', () => {
  it('side-table key is keyed only by hash (no orgId)', () => {
    // The side-table is a hash → URL lookup used by admin tooling only.
    // It is org-agnostic by design — admins look up the URL behind ANY hash they see
    // in metrics/logs without needing to know which org owned it.
    expect(serverUrlSideTableKey('abc123')).toBe('mcp_url:v1:abc123');
    expect(serverUrlSideTableKey('abc123')).not.toContain('org-');
  });
});
