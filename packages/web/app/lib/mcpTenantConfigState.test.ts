import type { McpTransport, VariableValue } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import type { McpTenantConfigRow, McpTenantDiscoveryRow } from './mcpTenantConfig';
import {
  applyCellOptimistic,
  cellKey,
  computeAggregateStatuses,
  computeTenantStatuses,
  mergeDiscoveryRow,
  mergeDiscoveryRows,
  mergeSavedRow,
} from './mcpTenantConfigState';

const AGENT = 'a1';
const ONE = 1;
const TWO = 2;

function row(serverId: string, tenantId: string, values: Record<string, VariableValue>): McpTenantConfigRow {
  return {
    agent_id: AGENT,
    server_id: serverId,
    tenant_id: tenantId,
    variable_values: values,
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const transport: McpTransport = { type: 'http', url: 'https://x/{{TOKEN}}' };

describe('cellKey', () => {
  it('joins server and tenant deterministically', () => {
    expect(cellKey('s1', 't1')).toBe(cellKey('s1', 't1'));
    expect(cellKey('s1', 't1')).not.toBe(cellKey('s1', 't2'));
  });
});

describe('applyCellOptimistic', () => {
  it('inserts a new row when none exists', () => {
    const next = applyCellOptimistic([], {
      agentId: AGENT,
      serverId: 's1',
      tenantId: 't1',
      values: { TOKEN: { type: 'direct', value: 'v' } },
    });
    expect(next).toHaveLength(ONE);
    expect(next.find((r) => r.tenant_id === 't1')?.variable_values).toEqual({
      TOKEN: { type: 'direct', value: 'v' },
    });
  });
  it('replaces the matching cell and leaves others intact', () => {
    const start = [row('s1', 't1', {}), row('s1', 't2', {})];
    const next = applyCellOptimistic(start, {
      agentId: AGENT,
      serverId: 's1',
      tenantId: 't1',
      values: { TOKEN: { type: 'direct', value: 'v' } },
    });
    expect(next.find((r) => r.tenant_id === 't1')?.variable_values).toEqual({
      TOKEN: { type: 'direct', value: 'v' },
    });
    expect(next.find((r) => r.tenant_id === 't2')?.variable_values).toEqual({});
  });
});

describe('mergeSavedRow', () => {
  it('overwrites the optimistic cell with the persisted row (updated_at)', () => {
    const original = row('s1', 't1', { TOKEN: { type: 'direct', value: 'v' } });
    const saved = { ...original, updated_at: '2026-02-02T00:00:00.000Z' };
    const next = mergeSavedRow([original], saved);
    expect(next.find((r) => r.tenant_id === 't1')?.updated_at).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('mergeDiscoveryRows', () => {
  it('replaces discovery rows for the verified server only', () => {
    const start: McpTenantDiscoveryRow[] = [
      {
        agent_id: AGENT,
        server_id: 's1',
        tenant_id: 't1',
        status: 'pending',
        error: null,
        values_hash: null,
        discovered_at: null,
      },
      {
        agent_id: AGENT,
        server_id: 's2',
        tenant_id: 't1',
        status: 'ok',
        error: null,
        values_hash: 'h',
        discovered_at: 'd',
      },
    ];
    const fresh: McpTenantDiscoveryRow[] = [
      {
        agent_id: AGENT,
        server_id: 's1',
        tenant_id: 't1',
        status: 'ok',
        error: null,
        values_hash: 'h',
        discovered_at: 'd',
      },
    ];
    const next = mergeDiscoveryRows(start, 's1', fresh);
    expect(next.find((r) => r.server_id === 's1')?.status).toBe('ok');
    expect(next.find((r) => r.server_id === 's2')?.status).toBe('ok');
    expect(next).toHaveLength(TWO);
  });
});

describe('mergeDiscoveryRow', () => {
  it('replaces only the matching (server, tenant) row, preserving siblings', () => {
    const start: McpTenantDiscoveryRow[] = [
      { agent_id: AGENT, server_id: 's1', tenant_id: 't1', status: 'pending', error: null, values_hash: null, discovered_at: null },
      { agent_id: AGENT, server_id: 's1', tenant_id: 't2', status: 'ok', error: null, values_hash: 'h', discovered_at: 'd' },
    ];
    const fresh: McpTenantDiscoveryRow = {
      agent_id: AGENT, server_id: 's1', tenant_id: 't1', status: 'ok', error: null, values_hash: 'h', discovered_at: 'd',
    };
    const next = mergeDiscoveryRow(start, fresh);
    expect(next).toHaveLength(TWO);
    expect(next.find((r) => r.tenant_id === 't1')?.status).toBe('ok');
    expect(next.find((r) => r.tenant_id === 't2')?.status).toBe('ok');
  });
});

describe('computeTenantStatuses + computeAggregateStatuses', () => {
  const envNameById: Record<string, string> = {};
  const input = {
    servers: [{ id: 's1', transport }],
    tenants: ['t1', 't2'],
    envNameById,
  };

  it('reports pending tenants whose vars are unfilled', () => {
    const statuses = computeTenantStatuses({ ...input, configs: [], discovery: [] });
    expect(statuses[cellKey('s1', 't1')]).toBe('pending');
    expect(statuses[cellKey('s1', 't2')]).toBe('pending');
  });

  it('aggregates pending tenants to warning, never ok', () => {
    const statuses = computeTenantStatuses({ ...input, configs: [], discovery: [] });
    const agg = computeAggregateStatuses(input.servers, input.tenants, statuses);
    expect(agg.s1).toBe('warning');
  });

  it('aggregates a server with zero tenants to warning', () => {
    const statuses = computeTenantStatuses({ ...input, tenants: [], configs: [], discovery: [] });
    const agg = computeAggregateStatuses(input.servers, [], statuses);
    expect(agg.s1).toBe('warning');
  });
});
