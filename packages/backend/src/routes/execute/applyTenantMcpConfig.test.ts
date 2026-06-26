import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import { RuntimeGraphSchema } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import {
  TenantConfigMissingError,
  applyTenantMcpConfig,
  assertTenantInSnapshot,
  parseTenantConfigSnapshot,
} from './applyTenantMcpConfig.js';

const MALFORMED_NUMBER = 5;

const SERVER: McpServerConfig = {
  id: 'srv-1',
  name: 'My MCP',
  transport: { type: 'http', url: 'https://x.com/{{HOST}}' },
  enabled: true,
};

function graphWith(servers: McpServerConfig[]): RuntimeGraph {
  return RuntimeGraphSchema.parse({
    startNode: 'INITIAL_STEP',
    agents: [],
    nodes: [],
    edges: [],
    mcpServers: servers,
  });
}

function emptyGraph(): RuntimeGraph {
  return RuntimeGraphSchema.parse({ startNode: 'INITIAL_STEP', agents: [], nodes: [], edges: [] });
}

const SNAPSHOT = [
  {
    serverId: 'srv-1',
    tenantId: 't-1',
    variableValues: { HOST: { type: 'direct' as const, value: 'tenant-one' } },
  },
  {
    serverId: 'srv-1',
    tenantId: 't-2',
    variableValues: { HOST: { type: 'direct' as const, value: 'tenant-two' } },
  },
];

describe('applyTenantMcpConfig', () => {
  it("swaps in the run tenant's variableValues for each matching server", () => {
    const { mcpServers } = applyTenantMcpConfig(graphWith([SERVER]), SNAPSHOT, 't-2');
    const [server] = mcpServers ?? [];
    expect(server?.variableValues).toEqual({ HOST: { type: 'direct', value: 'tenant-two' } });
  });

  it('leaves servers without a matching snapshot row untouched', () => {
    const other: McpServerConfig = {
      ...SERVER,
      id: 'other',
      variableValues: { HOST: { type: 'direct', value: 'orig' } },
    };
    const { mcpServers } = applyTenantMcpConfig(graphWith([other]), SNAPSHOT, 't-2');
    const [server] = mcpServers ?? [];
    expect(server?.variableValues).toEqual({ HOST: { type: 'direct', value: 'orig' } });
  });

  it('returns the graph unchanged when there are no mcp servers', () => {
    const graph = emptyGraph();
    expect(applyTenantMcpConfig(graph, SNAPSHOT, 't-2')).toBe(graph);
  });
});

describe('assertTenantInSnapshot', () => {
  it('throws TenantConfigMissingError naming the tenant when servers exist but tenant absent', () => {
    const call = (): void => {
      assertTenantInSnapshot({ snapshot: SNAPSHOT, tenantId: 't-missing', mcpServers: [SERVER] });
    };
    expect(call).toThrow(TenantConfigMissingError);
    expect(call).toThrow('t-missing');
  });

  it('does not throw when the tenant has snapshot rows', () => {
    const call = (): void => {
      assertTenantInSnapshot({ snapshot: SNAPSHOT, tenantId: 't-1', mcpServers: [SERVER] });
    };
    expect(call).not.toThrow();
  });

  it('does not throw when there are no mcp servers', () => {
    const call = (): void => {
      assertTenantInSnapshot({ snapshot: [], tenantId: 't-missing', mcpServers: [] });
    };
    expect(call).not.toThrow();
  });

  it('does not throw when mcpServers is undefined', () => {
    const call = (): void => {
      assertTenantInSnapshot({ snapshot: [], tenantId: 't-missing', mcpServers: undefined });
    };
    expect(call).not.toThrow();
  });
});

describe('parseTenantConfigSnapshot', () => {
  it('parses well-formed snapshot rows', () => {
    expect(parseTenantConfigSnapshot({ mcpTenantConfig: SNAPSHOT })).toEqual(SNAPSHOT);
  });

  it('returns [] when the key is absent', () => {
    expect(parseTenantConfigSnapshot({})).toEqual([]);
  });

  it('returns [] when graphData is null', () => {
    expect(parseTenantConfigSnapshot(null)).toEqual([]);
  });

  it('drops malformed rows', () => {
    const parsed = parseTenantConfigSnapshot({
      mcpTenantConfig: [
        { serverId: 'srv-1', tenantId: 't-1', variableValues: {} },
        { serverId: 'x' },
        MALFORMED_NUMBER,
      ],
    });
    expect(parsed).toEqual([{ serverId: 'srv-1', tenantId: 't-1', variableValues: {} }]);
  });
});
