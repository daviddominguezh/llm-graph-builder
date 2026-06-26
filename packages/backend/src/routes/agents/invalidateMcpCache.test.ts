import type { McpServerConfig } from '@daviddh/graph-types';
import { hashServerUrl } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import { type TenantConfigSnapshot, resolveTenantServerUrls } from './invalidateMcpCache.js';

const EXPECTED_TWO = 2;
const EXPECTED_ONE = 1;
const EXPECTED_NONE = 0;

const SERVER: McpServerConfig = {
  id: 's1',
  name: 'server',
  enabled: true,
  transport: { type: 'http', url: 'https://{{HOST}}/mcp' },
};

const EMPTY_ENV = { byName: {}, byId: {} };

function hostRow(tenantId: string, host: string, serverId = 's1'): TenantConfigSnapshot {
  return { serverId, tenantId, variableValues: { HOST: { type: 'direct', value: host } } };
}

const TWO_DISTINCT = [hostRow('t1', 'a.example.com'), hostRow('t2', 'b.example.com')];

describe('resolveTenantServerUrls', () => {
  it('produces one distinct resolved url per tenant HOST value', () => {
    const urls = resolveTenantServerUrls(SERVER, TWO_DISTINCT, EMPTY_ENV);
    expect(urls).toHaveLength(EXPECTED_TWO);
    expect(urls).toContain('https://a.example.com/mcp');
    expect(urls).toContain('https://b.example.com/mcp');
  });

  it('two tenants with different HOST values hash to two distinct cache hashes', async () => {
    const urls = resolveTenantServerUrls(SERVER, TWO_DISTINCT, EMPTY_ENV);
    const hashes = await Promise.all(urls.map(async (u) => await hashServerUrl(u)));
    expect(new Set(hashes).size).toBe(EXPECTED_TWO);
  });

  it('dedupes identical resolved urls across tenants', () => {
    const rows = [hostRow('t1', 'same.example.com'), hostRow('t2', 'same.example.com')];
    expect(resolveTenantServerUrls(SERVER, rows, EMPTY_ENV)).toHaveLength(EXPECTED_ONE);
  });
});

describe('resolveTenantServerUrls fallbacks', () => {
  it('ignores snapshot rows for other servers and falls back to the template url', () => {
    const rows = [hostRow('t1', 'x.example.com', 'other')];
    expect(resolveTenantServerUrls(SERVER, rows, EMPTY_ENV)).toEqual(['https://{{HOST}}/mcp']);
  });

  it('falls back to the template url when no tenant config rows exist', () => {
    expect(resolveTenantServerUrls(SERVER, [], EMPTY_ENV)).toEqual(['https://{{HOST}}/mcp']);
  });

  it('returns no urls for a stdio server (no cacheable url)', () => {
    const stdio: McpServerConfig = {
      id: 's2',
      name: 'cli',
      enabled: true,
      transport: { type: 'stdio', command: 'run' },
    };
    expect(resolveTenantServerUrls(stdio, [], EMPTY_ENV)).toHaveLength(EXPECTED_NONE);
  });
});
