import { describe, expect, it } from '@jest/globals';

import type { ServerAggregateStatus } from '../../../lib/mcpTenantConfig';
import type { McpServerConfig } from '../../../schemas/graph.schema';
import { aggregateStatusFor, hasMcpAggregateError, hasMcpTenantErrors } from '../mcpTenantGate';

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

describe('hasMcpAggregateError', () => {
  it('is true when an enabled server aggregate is error', () => {
    const i = input([server('a', true), server('b', true)], { a: 'ok', b: 'error' });
    expect(hasMcpAggregateError(i)).toBe(true);
  });

  it('is false when the only error is on a disabled server', () => {
    const i = input([server('a', false)], { a: 'error' });
    expect(hasMcpAggregateError(i)).toBe(false);
  });

  it('is false for warning-only aggregates (warning is not error)', () => {
    const i = input([server('a', true)], { a: 'warning' });
    expect(hasMcpAggregateError(i)).toBe(false);
  });

  it('is false when a server has no aggregate entry', () => {
    const i = input([server('a', true)], {});
    expect(hasMcpAggregateError(i)).toBe(false);
  });

  it('is false with no servers', () => {
    expect(hasMcpAggregateError(input([], {}))).toBe(false);
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
