import type { McpServerConfig, McpTransport } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import type { DecryptedEnvVars } from '../../db/queries/executionAuthQueries.js';
import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import { type SimResolveContext, applyTenantResolution } from '../simMcpResolution.js';

const AGENT_ID = 'agent-1';
const DEFAULT_TENANT = 'tenant-default';
const OTHER_TENANT = 'tenant-other';
const LIBRARY_ITEM = 'lib-linear';
const ENV_ID = 'env-linear';
const SECRET = 'lin_api_secret';

const env: DecryptedEnvVars = { byName: {}, byId: { [ENV_ID]: SECRET } };

// The pristine library template (kept server-side) still carries `{{TOKEN}}`.
const PRISTINE_TRANSPORT: McpTransport = {
  type: 'http',
  url: 'https://mcp.linear.app',
  headers: { Authorization: 'Bearer {{TOKEN}}' },
};

// A custom (non-library) server keeps its own template — no reconstruction.
function customServer(): McpServerConfig {
  return {
    id: 'custom',
    name: 'Custom',
    enabled: true,
    transport: { type: 'http', url: 'https://custom.example', headers: { Authorization: 'Bearer {{TOKEN}}' } },
  };
}

// A library-backed server whose FE transport was FLATTENED by the proxy to an
// empty `Bearer ` (secret template stripped client-side). It carries a libraryItemId.
function linearServer(): McpServerConfig {
  return {
    id: 'linear',
    name: 'Linear',
    enabled: true,
    libraryItemId: LIBRARY_ITEM,
    transport: { type: 'http', url: 'https://mcp.linear.app', headers: { Authorization: 'Bearer ' } },
  };
}

function configRow(tenantId: string): McpTenantConfigRow {
  return {
    agent_id: AGENT_ID,
    server_id: 'linear',
    tenant_id: tenantId,
    variable_values: { TOKEN: { type: 'env_ref', envVariableId: ENV_ID } },
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function ctx(overrides: Partial<SimResolveContext>): SimResolveContext {
  return {
    tenantConfigs: [],
    defaultTenantId: DEFAULT_TENANT,
    env,
    pristineTransports: new Map([[LIBRARY_ITEM, PRISTINE_TRANSPORT]]),
    ...overrides,
  };
}

function resolvedAuth(servers: McpServerConfig[]): string | undefined {
  const [server] = servers;
  if (server === undefined) return undefined;
  const { transport } = server;
  if (transport.type === 'stdio') return undefined;
  return transport.headers?.Authorization;
}

describe('applyTenantResolution', () => {
  it('reconstructs from the library template + default-tenant ref despite a flattened FE transport', () => {
    // FE transport is `Bearer ` (no template), but the library item template +
    // default-tenant secret ref resolve to the real token.
    const out = applyTenantResolution([linearServer()], ctx({ tenantConfigs: [configRow(DEFAULT_TENANT)] }));
    expect(resolvedAuth(out)).toBe(`Bearer ${SECRET}`);
  });

  it('ignores config rows for a non-default tenant', () => {
    // No matching default-tenant row => no vars => the pristine `{{TOKEN}}` stays intact.
    const out = applyTenantResolution([linearServer()], ctx({ tenantConfigs: [configRow(OTHER_TENANT)] }));
    expect(resolvedAuth(out)).toBe('Bearer {{TOKEN}}');
  });

  it('falls back to the server-embedded variableValues when there is no tenant row', () => {
    const server = { ...linearServer(), variableValues: { TOKEN: { type: 'direct' as const, value: 'inline' } } };
    const out = applyTenantResolution([server], ctx({}));
    expect(resolvedAuth(out)).toBe('Bearer inline');
  });

  it('skips tenant lookup when the default tenant is undefined', () => {
    const out = applyTenantResolution(
      [linearServer()],
      ctx({ tenantConfigs: [configRow(DEFAULT_TENANT)], defaultTenantId: undefined })
    );
    expect(resolvedAuth(out)).toBe('Bearer {{TOKEN}}');
  });

  it('keeps the FE transport for a custom server with no library item', () => {
    // No libraryItemId => not in the pristine map => resolve against the FE transport.
    const server = { ...customServer(), variableValues: { TOKEN: { type: 'direct' as const, value: 'x' } } };
    const out = applyTenantResolution([server], ctx({}));
    expect(resolvedAuth(out)).toBe('Bearer x');
  });
});
