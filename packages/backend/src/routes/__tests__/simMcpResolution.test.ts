import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import type { DecryptedEnvVars } from '../../db/queries/executionAuthQueries.js';
import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import { applyTenantResolution } from '../simMcpResolution.js';

const AGENT_ID = 'agent-1';
const DEFAULT_TENANT = 'tenant-default';
const OTHER_TENANT = 'tenant-other';
const ENV_ID = 'env-linear';
const SECRET = 'lin_api_secret';

function linearServer(): McpServerConfig {
  return {
    id: 'linear',
    name: 'Linear',
    enabled: true,
    transport: { type: 'http', url: 'https://mcp.linear.app', headers: { Authorization: 'Bearer {{TOKEN}}' } },
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

const env: DecryptedEnvVars = { byName: {}, byId: { [ENV_ID]: SECRET } };

function resolvedAuth(servers: McpServerConfig[]): string | undefined {
  const [server] = servers;
  if (server === undefined) return undefined;
  const { transport } = server;
  if (transport.type === 'stdio') return undefined;
  return transport.headers?.Authorization;
}

describe('applyTenantResolution', () => {
  it('substitutes a secret env ref from the DEFAULT tenant config into the transport', () => {
    const out = applyTenantResolution([linearServer()], [configRow(DEFAULT_TENANT)], DEFAULT_TENANT, env);
    expect(resolvedAuth(out)).toBe(`Bearer ${SECRET}`);
  });

  it('ignores config rows for a non-default tenant', () => {
    const out = applyTenantResolution([linearServer()], [configRow(OTHER_TENANT)], DEFAULT_TENANT, env);
    // No matching default-tenant row and no server-embedded vars => the `{{TOKEN}}`
    // template is left intact (never substituted with the wrong tenant's secret).
    expect(resolvedAuth(out)).toBe('Bearer {{TOKEN}}');
  });

  it('falls back to the server-embedded variableValues when there is no tenant row', () => {
    const server = { ...linearServer(), variableValues: { TOKEN: { type: 'direct' as const, value: 'inline' } } };
    const out = applyTenantResolution([server], [], DEFAULT_TENANT, env);
    expect(resolvedAuth(out)).toBe('Bearer inline');
  });

  it('skips tenant lookup when the default tenant is undefined', () => {
    const out = applyTenantResolution([linearServer()], [configRow(DEFAULT_TENANT)], undefined, env);
    expect(resolvedAuth(out)).toBe('Bearer {{TOKEN}}');
  });
});
