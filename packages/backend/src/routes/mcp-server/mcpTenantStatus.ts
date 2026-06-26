import type { ServerTenantStatus } from '../../db/queries/mcpTenantDiscoveryQueries.js';

export type ServerAggregateStatus = 'ok' | 'warning' | 'error';

export interface TenantStatusArgs {
  extractedVars: string[];
  resolvedValues: Record<string, string>;
  discovery: { status: ServerTenantStatus; valuesHash: string | null } | undefined;
  currentHash: string;
}

const EMPTY_LENGTH = 0;

function allVarsFilled(extractedVars: string[], resolvedValues: Record<string, string>): boolean {
  return extractedVars.every((name) => {
    const { [name]: value } = resolvedValues;
    return value !== undefined && value !== '';
  });
}

export function computeServerTenantStatus(args: TenantStatusArgs): ServerTenantStatus {
  if (!allVarsFilled(args.extractedVars, args.resolvedValues)) return 'pending';
  const { discovery } = args;
  if (discovery?.valuesHash !== args.currentHash) return 'pending';
  return discovery.status;
}

export function aggregateServerStatus(perTenant: ServerTenantStatus[]): ServerAggregateStatus {
  if (perTenant.some((s) => s === 'error')) return 'error';
  const hasTenants = perTenant.length > EMPTY_LENGTH;
  if (hasTenants && perTenant.every((s) => s === 'ok')) return 'ok';
  return 'warning';
}
