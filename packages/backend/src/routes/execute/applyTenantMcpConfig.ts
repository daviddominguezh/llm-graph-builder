import type { McpServerConfig, RuntimeGraph, VariableValue } from '@daviddh/graph-types';

/* ─── Snapshot shape (rides graph_data.mcpTenantConfig; written by the publish RPCs) ─── */

export interface TenantConfigSnapshot {
  serverId: string;
  tenantId: string;
  variableValues: Record<string, VariableValue>;
}

const EMPTY_SNAPSHOT: TenantConfigSnapshot[] = [];
const NO_SERVERS = 0;

/* ─── Fail-fast error when the run tenant is absent from the published snapshot ─── */

export class TenantConfigMissingError extends Error {
  constructor(tenantId: string) {
    super(
      `No per-tenant MCP configuration was published for tenant "${tenantId}". ` +
        'Republish the agent so this tenant is included in the snapshot.'
    );
    this.name = 'TenantConfigMissingError';
  }
}

/* ─── Snapshot parsing (graph_data → typed rows; drops malformed entries) ─── */

function isVariableValuesRecord(value: unknown): value is Record<string, VariableValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringField(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string';
}

function isSnapshotRow(value: unknown): value is TenantConfigSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    hasStringField(row, 'serverId') &&
    hasStringField(row, 'tenantId') &&
    isVariableValuesRecord(row.variableValues)
  );
}

export function parseTenantConfigSnapshot(graphData: Record<string, unknown> | null): TenantConfigSnapshot[] {
  if (graphData === null) return [];
  const { mcpTenantConfig } = graphData;
  if (!Array.isArray(mcpTenantConfig)) return [];
  return mcpTenantConfig.filter(isSnapshotRow);
}

/* ─── Per-tenant value application ─── */

function buildTenantValueMap(
  snapshot: TenantConfigSnapshot[],
  tenantId: string
): Map<string, Record<string, VariableValue>> {
  const map = new Map<string, Record<string, VariableValue>>();
  for (const row of snapshot) {
    if (row.tenantId === tenantId) map.set(row.serverId, row.variableValues);
  }
  return map;
}

function applyToServer(
  server: McpServerConfig,
  byServerId: Map<string, Record<string, VariableValue>>
): McpServerConfig {
  const values = byServerId.get(server.id);
  if (values === undefined) return server;
  return { ...server, variableValues: values };
}

export function applyTenantMcpConfig(
  graph: RuntimeGraph,
  snapshot: TenantConfigSnapshot[],
  tenantId: string
): RuntimeGraph {
  const { mcpServers } = graph;
  if (mcpServers === undefined || mcpServers.length === NO_SERVERS) return graph;
  const byServerId = buildTenantValueMap(snapshot, tenantId);
  return { ...graph, mcpServers: mcpServers.map((s) => applyToServer(s, byServerId)) };
}

/* ─── Fail-fast tenant presence check ─── */

export interface AssertTenantArgs {
  snapshot: TenantConfigSnapshot[];
  tenantId: string;
  mcpServers: McpServerConfig[] | undefined;
}

export function assertTenantInSnapshot(args: AssertTenantArgs): void {
  const { snapshot, tenantId, mcpServers } = args;
  if (mcpServers === undefined || mcpServers.length === NO_SERVERS) return;
  const hasTenant = snapshot.some((row) => row.tenantId === tenantId);
  if (!hasTenant) throw new TenantConfigMissingError(tenantId);
}

export { EMPTY_SNAPSHOT };
