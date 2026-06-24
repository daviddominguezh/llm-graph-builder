import type { ServerAggregateStatus } from '../../lib/mcpTenantConfig';
import type { McpServerConfig } from '../../schemas/graph.schema';

/*
 * Pure publish/save gate logic for tenant-scoped MCP config (SP4 D9).
 *
 * A server is publishable only when its aggregate per-tenant status is 'ok'
 * (i.e. EVERY tenant is configured + verified). 'warning' (some tenants
 * pending/needs-config) and 'error' both BLOCK publish. Disabled servers are
 * skipped entirely. A server with an unknown/absent aggregate (no tenant data)
 * is treated as a blocking 'warning'.
 */

export interface McpTenantGateInput {
  servers: McpServerConfig[];
  aggregateStatus: Record<string, ServerAggregateStatus>;
}

const DEFAULT_AGGREGATE: ServerAggregateStatus = 'warning';

export function aggregateStatusFor(input: McpTenantGateInput, serverId: string): ServerAggregateStatus {
  return input.aggregateStatus[serverId] ?? DEFAULT_AGGREGATE;
}

/** Returns true when an enabled server's aggregate status blocks publish. */
function serverBlocksPublish(input: McpTenantGateInput, server: McpServerConfig): boolean {
  if (!server.enabled) return false;
  return aggregateStatusFor(input, server.id) !== 'ok';
}

/** Returns true when there are blocking errors (any enabled server not all-tenant-ok). */
export function hasMcpTenantErrors(input: McpTenantGateInput): boolean {
  return input.servers.some((server) => serverBlocksPublish(input, server));
}

/**
 * Returns true when at least one enabled server's aggregate status is 'error'
 * (the red state surfaced in the tools list). Distinct from
 * {@link hasMcpTenantErrors}, which also blocks on the 'warning' state.
 */
export function hasMcpAggregateError(input: McpTenantGateInput): boolean {
  return input.servers.some((server) => server.enabled && aggregateStatusFor(input, server.id) === 'error');
}
