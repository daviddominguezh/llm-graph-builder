import { describe, expect, it } from '@jest/globals';

import {
  buildCellPath,
  buildConfigPath,
  buildStatusPath,
  buildVerifyPath,
  isMcpTenantConfigRow,
  isMcpTenantDiscoveryRow,
} from './mcpTenantConfig';

const CONFIG_BASE = {
  agent_id: 'a1',
  server_id: 's1',
  tenant_id: 't1',
  variable_values: {},
  updated_at: '2026-01-01T00:00:00Z',
};

const DISCOVERY_BASE = {
  agent_id: 'a1',
  server_id: 's1',
  tenant_id: 't1',
  status: 'ok',
  error: null,
  values_hash: null,
  discovered_at: null,
};

describe('web isMcpTenantConfigRow', () => {
  it('rejects a row missing variable_values', () => {
    const { variable_values: _omit, ...rest } = CONFIG_BASE;
    expect(isMcpTenantConfigRow(rest)).toBe(false);
  });
  it('accepts a complete row', () => {
    expect(isMcpTenantConfigRow(CONFIG_BASE)).toBe(true);
  });
});

describe('web isMcpTenantDiscoveryRow', () => {
  it('rejects a row missing status', () => {
    const { status: _omit, ...rest } = DISCOVERY_BASE;
    expect(isMcpTenantDiscoveryRow(rest)).toBe(false);
  });
  it('accepts a complete row', () => {
    expect(isMcpTenantDiscoveryRow(DISCOVERY_BASE)).toBe(true);
  });
});

describe('mcp tenant config URL building', () => {
  it('encodes the agent id in every path', () => {
    expect(buildConfigPath('a/b')).toBe('/agents/a%2Fb/mcp-tenant-config');
    expect(buildStatusPath('a/b')).toBe('/agents/a%2Fb/mcp-tenant-config/status');
  });
  it('encodes server and tenant in the cell path', () => {
    expect(buildCellPath('a 1', 's/1', 't 1')).toBe('/agents/a%201/mcp-tenant-config/s%2F1/t%201');
  });
  it('encodes server in the verify path', () => {
    expect(buildVerifyPath('a1', 's/1')).toBe('/agents/a1/mcp-tenant-config/s%2F1/verify');
  });
});
