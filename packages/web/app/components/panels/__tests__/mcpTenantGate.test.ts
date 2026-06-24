import { describe, expect, it } from '@jest/globals';

import type { ServerAggregateStatus } from '../../../lib/mcpTenantConfig';
import type { McpServerConfig } from '../../../schemas/graph.schema';
import { aggregateStatusFor, hasMcpTenantErrors } from '../mcpTenantGate';

function server(id: string, enabled: boolean): McpServerConfig {
  return {
    id,
    name: id,
    enabled,
    transport: { type: 'http', url: `https://example.com/${id}` },
  };
}

function input(
  servers: McpServerConfig[],
  aggregateStatus: Record<string, ServerAggregateStatus>
): { servers: McpServerConfig[]; aggregateStatus: Record<string, ServerAggregateStatus> } {
  return { servers, aggregateStatus };
}

describe('hasMcpTenantErrors', () => {
  it('passes when every enabled server aggregate is ok', () => {
    const i = input([server('a', true), server('b', true)], { a: 'ok', b: 'ok' });
    expect(hasMcpTenantErrors(i)).toBe(false);
  });

  it('blocks when any enabled server aggregate is warning', () => {
    const i = input([server('a', true), server('b', true)], { a: 'ok', b: 'warning' });
    expect(hasMcpTenantErrors(i)).toBe(true);
  });

  it('blocks when any enabled server aggregate is error', () => {
    const i = input([server('a', true)], { a: 'error' });
    expect(hasMcpTenantErrors(i)).toBe(true);
  });

  it('blocks when a server has no aggregate entry (empty tenants)', () => {
    const i = input([server('a', true)], {});
    expect(hasMcpTenantErrors(i)).toBe(true);
  });

  it('skips disabled servers even when their aggregate is not ok', () => {
    const i = input([server('a', false)], { a: 'error' });
    expect(hasMcpTenantErrors(i)).toBe(false);
  });

  it('passes with no servers', () => {
    expect(hasMcpTenantErrors(input([], {}))).toBe(false);
  });
});

describe('aggregateStatusFor', () => {
  it('returns the stored aggregate when present', () => {
    expect(aggregateStatusFor(input([], { a: 'ok' }), 'a')).toBe('ok');
  });

  it('defaults an unknown server to warning', () => {
    expect(aggregateStatusFor(input([], {}), 'missing')).toBe('warning');
  });
});
