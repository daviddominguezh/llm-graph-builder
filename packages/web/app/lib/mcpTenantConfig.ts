import type { VariableValue } from '@daviddh/graph-types';

import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types (mirror the backend agent-scoped MCP per-tenant rows)        */
/* ------------------------------------------------------------------ */

export type ServerTenantStatus = 'ok' | 'pending' | 'error';
export type ServerAggregateStatus = 'ok' | 'warning' | 'error';

export interface McpTenantConfigRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  variable_values: Record<string, VariableValue>;
  updated_at: string;
}

export interface McpTenantDiscoveryRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  status: ServerTenantStatus;
  error: string | null;
  values_hash: string | null;
  discovered_at: string | null;
}

export interface ServerStatusEntry {
  serverId: string;
  aggregate: ServerAggregateStatus;
  perTenant: Array<{ tenantId: string; status: ServerTenantStatus }>;
}

export interface McpTenantConfigBundle {
  configs: McpTenantConfigRow[];
  discovery: McpTenantDiscoveryRow[];
}

export interface McpTenantStatusBundle extends McpTenantConfigBundle {
  status: ServerStatusEntry[];
}

export interface SaveCellArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  variableValues: Record<string, VariableValue>;
  expectedUpdatedAt: string | null;
}

export type SaveCellResult =
  | { kind: 'ok'; row: McpTenantConfigRow }
  | { kind: 'conflict' }
  | { kind: 'error'; error: string };

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isMcpTenantConfigRow(value: unknown): value is McpTenantConfigRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'agent_id' in value &&
    'server_id' in value &&
    'tenant_id' in value &&
    'variable_values' in value &&
    'updated_at' in value
  );
}

export function isMcpTenantDiscoveryRow(value: unknown): value is McpTenantDiscoveryRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'agent_id' in value &&
    'server_id' in value &&
    'tenant_id' in value &&
    'status' in value &&
    'error' in value &&
    'values_hash' in value &&
    'discovered_at' in value
  );
}

function isServerStatusEntry(value: unknown): value is ServerStatusEntry {
  if (typeof value !== 'object' || value === null) return false;
  return 'serverId' in value && 'aggregate' in value && 'perTenant' in value;
}

function isConfigBundle(value: unknown): value is McpTenantConfigBundle {
  if (typeof value !== 'object' || value === null) return false;
  if (!('configs' in value) || !('discovery' in value)) return false;
  return (
    Array.isArray(value.configs) &&
    value.configs.every(isMcpTenantConfigRow) &&
    Array.isArray(value.discovery) &&
    value.discovery.every(isMcpTenantDiscoveryRow)
  );
}

function isStatusBundle(value: unknown): value is McpTenantStatusBundle {
  if (!isConfigBundle(value)) return false;
  if (!('status' in value)) return false;
  return Array.isArray(value.status) && value.status.every(isServerStatusEntry);
}

function isDiscoveryRowArray(value: unknown): value is McpTenantDiscoveryRow[] {
  return Array.isArray(value) && value.every(isMcpTenantDiscoveryRow);
}

/* ------------------------------------------------------------------ */
/*  URL builders                                                       */
/* ------------------------------------------------------------------ */

export function buildConfigPath(agentId: string): string {
  return `/agents/${encodeURIComponent(agentId)}/mcp-tenant-config`;
}

export function buildStatusPath(agentId: string): string {
  return `${buildConfigPath(agentId)}/status`;
}

export function buildCellPath(agentId: string, serverId: string, tenantId: string): string {
  return `${buildConfigPath(agentId)}/${encodeURIComponent(serverId)}/${encodeURIComponent(tenantId)}`;
}

export function buildVerifyPath(agentId: string, serverId: string): string {
  return `${buildConfigPath(agentId)}/${encodeURIComponent(serverId)}/verify`;
}

export function buildTenantVerifyPath(agentId: string, serverId: string, tenantId: string): string {
  return `${buildCellPath(agentId, serverId, tenantId)}/verify`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

// fetchFromBackend throws on non-2xx with the status embedded in the message.
function isConflictError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('(409)');
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function getMcpTenantConfig(
  agentId: string
): Promise<{ result: McpTenantConfigBundle | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', buildConfigPath(agentId));
    if (!isConfigBundle(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function getMcpTenantStatus(
  agentId: string
): Promise<{ result: McpTenantStatusBundle | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', buildStatusPath(agentId));
    if (!isStatusBundle(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function saveMcpTenantCell(args: SaveCellArgs): Promise<SaveCellResult> {
  try {
    const data = await fetchFromBackend('PUT', buildCellPath(args.agentId, args.serverId, args.tenantId), {
      variableValues: args.variableValues,
      expectedUpdatedAt: args.expectedUpdatedAt,
    });
    const row = extractRow(data);
    if (row === null) return { kind: 'error', error: 'Invalid response' };
    return { kind: 'ok', row };
  } catch (err) {
    if (isConflictError(err)) return { kind: 'conflict' };
    return { kind: 'error', error: extractError(err) };
  }
}

function extractRow(data: unknown): McpTenantConfigRow | null {
  if (typeof data !== 'object' || data === null || !('row' in data)) return null;
  return isMcpTenantConfigRow(data.row) ? data.row : null;
}

export async function verifyMcpTenantServer(
  agentId: string,
  serverId: string
): Promise<{ result: McpTenantDiscoveryRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', buildVerifyPath(agentId, serverId));
    if (typeof data !== 'object' || data === null || !('rows' in data) || !isDiscoveryRowArray(data.rows)) {
      return { result: [], error: 'Invalid response' };
    }
    return { result: data.rows, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

function extractDiscoveryRow(data: unknown): McpTenantDiscoveryRow | null {
  if (typeof data !== 'object' || data === null || !('row' in data)) return null;
  return isMcpTenantDiscoveryRow(data.row) ? data.row : null;
}

export async function verifyMcpTenantTenant(
  agentId: string,
  serverId: string,
  tenantId: string
): Promise<{ result: McpTenantDiscoveryRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', buildTenantVerifyPath(agentId, serverId, tenantId));
    const row = extractDiscoveryRow(data);
    if (row === null) return { result: null, error: 'Invalid response' };
    return { result: row, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}
