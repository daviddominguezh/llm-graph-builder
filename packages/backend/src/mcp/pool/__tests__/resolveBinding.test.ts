import { describe, expect, it } from '@jest/globals';

import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';

import type { McpTenantConfigRow } from '../../../db/queries/mcpTenantConfigQueries.js';
import { BindingNotFoundError, type ResolveBindingDeps, resolveBinding } from '../resolveBinding.js';

const CURRENT_VERSION = 3;
const FIRST = 0;

const rawServer: McpServerConfig = {
  id: 'srv1',
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://srv.test/mcp' },
};

function deps(over: Partial<ResolveBindingDeps> = {}): ResolveBindingDeps {
  return {
    getAgent: async () => await Promise.resolve({ id: 'ag1', org_id: 'org1', current_version: CURRENT_VERSION }),
    getGraph: async () => await Promise.resolve({ mcpServers: [rawServer] }),
    getTenantConfigs: async () => await Promise.resolve([]),
    getEnv: async () => await Promise.resolve({ byName: {}, byId: {} }),
    resolveTransport: (s) => s,
    ...over,
  };
}

function tenantRow(tenantId: string, vars: Record<string, VariableValue>): McpTenantConfigRow {
  return { agent_id: 'ag1', server_id: 'srv1', tenant_id: tenantId, variable_values: vars, updated_at: 'x' };
}

async function captureResolvedServers(rows: McpTenantConfigRow[]): Promise<McpServerConfig[]> {
  const captured: McpServerConfig[] = [];
  await resolveBinding({
    agentId: 'ag1',
    tenantId: 't1',
    mcpBindingId: 'srv1',
    deps: deps({
      getTenantConfigs: async () => await Promise.resolve(rows),
      resolveTransport: (s) => {
        captured.push(s);
        return s;
      },
    }),
  });
  return captured;
}

describe('resolveBinding happy path', () => {
  it('derives orgId from agentId and selects the server by mcpBindingId (=server.id)', async () => {
    const r = await resolveBinding({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'srv1', deps: deps() });
    expect(r.orgId).toBe('org1');
    expect(r.server.id).toBe('srv1');
  });
});

describe('resolveBinding tenant scoping', () => {
  it('applies tenant-scoped variableValues for the matching (agent, server, tenant)', async () => {
    const tenantVals: Record<string, VariableValue> = {
      url: { type: 'direct', value: 'https://tenant.test/mcp' },
    };
    const captured = await captureResolvedServers([tenantRow('t1', tenantVals)]);
    expect(captured[FIRST]?.variableValues).toEqual(tenantVals);
  });

  it('ignores tenant config for a tenant the binding does not match (no cross-tenant leak)', async () => {
    const otherVals: Record<string, VariableValue> = {
      url: { type: 'direct', value: 'https://other.test/mcp' },
    };
    const captured = await captureResolvedServers([tenantRow('t-other', otherVals)]);
    expect(captured[FIRST]?.variableValues).toBeUndefined();
  });
});

describe('resolveBinding rejection (trust boundary)', () => {
  it('throws BindingNotFoundError when the agent does not exist', async () => {
    const call = resolveBinding({
      agentId: 'nope',
      tenantId: 't1',
      mcpBindingId: 'srv1',
      deps: deps({ getAgent: async () => await Promise.resolve(null) }),
    });
    await expect(call).rejects.toBeInstanceOf(BindingNotFoundError);
  });

  it('throws BindingNotFoundError when the server id is not in the graph', async () => {
    const call = resolveBinding({ agentId: 'ag1', tenantId: 't1', mcpBindingId: 'ghost', deps: deps() });
    await expect(call).rejects.toBeInstanceOf(BindingNotFoundError);
  });
});
