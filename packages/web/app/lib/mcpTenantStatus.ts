import type { VariableValue } from '@daviddh/graph-types';

import type { ServerAggregateStatus, ServerTenantStatus } from './mcpTenantConfig';

/*
 * Pure status logic. The two status functions MIRROR the backend Task 4 helper
 * (packages/backend/src/routes/mcp-server/mcpTenantStatus.ts) EXACTLY so the
 * client-computed status never diverges from the server-computed one.
 */

export type { ServerAggregateStatus, ServerTenantStatus } from './mcpTenantConfig';

export interface TenantStatusArgs {
  extractedVars: string[];
  resolvedValues: Record<string, string>;
  discovery: { status: ServerTenantStatus; valuesHash: string | null } | undefined;
  currentHash: string;
}

const EMPTY_LENGTH = 0;

function allVarsFilled(extractedVars: string[], resolvedValues: Record<string, string>): boolean {
  return extractedVars.every((name) => (resolvedValues[name] ?? '') !== '');
}

// per-(server,tenant): 'ok' iff every var has a non-empty resolved value AND
// discovery status==='ok' with a matching hash; missing/stale hash => 'pending';
// 'error' only honored when the hash matches.
export function computeServerTenantStatus(args: TenantStatusArgs): ServerTenantStatus {
  if (!allVarsFilled(args.extractedVars, args.resolvedValues)) return 'pending';
  const { discovery } = args;
  if (discovery?.valuesHash !== args.currentHash) return 'pending';
  return discovery.status;
}

// per-server aggregate: 'ok' iff all tenants ok; 'error' if any tenant error;
// else 'warning'. An EMPTY tenant array => 'warning' (NOT ok).
export function aggregateServerStatus(perTenant: ServerTenantStatus[]): ServerAggregateStatus {
  if (perTenant.some((s) => s === 'error')) return 'error';
  const hasTenants = perTenant.length > EMPTY_LENGTH;
  if (hasTenants && perTenant.every((s) => s === 'ok')) return 'ok';
  return 'warning';
}

// Canonical (sorted-key) JSON form. Byte-identical to the backend's
// hashVariableValues input (JSON of sorted [key, value] pairs) so the SHA-256
// digest matches the persisted discovery values_hash.
export function canonicalizeVariableValues(values: Record<string, VariableValue>): string {
  const sortedKeys = Object.keys(values).sort();
  const canonical = sortedKeys.map((k) => [k, values[k]]);
  return JSON.stringify(canonical);
}

// Build the resolved-value map the status check consumes. Secrets never reach
// the browser, so an env_ref resolves to its (non-empty) env-variable name as a
// "filled" sentinel; an unselected env_ref or empty direct value stays ''.
export function buildCellResolvedValues(
  values: Record<string, VariableValue>,
  envNameById: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    resolved[name] = resolveOne(value, envNameById);
  }
  return resolved;
}

function resolveOne(value: VariableValue, envNameById: Record<string, string>): string {
  if (value.type === 'direct') return value.value;
  if (value.envVariableId === '') return '';
  return envNameById[value.envVariableId] ?? '';
}
