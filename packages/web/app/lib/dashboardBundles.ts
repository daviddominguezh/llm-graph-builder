import { fetchFromBackend } from './backendProxy';
import type { DashboardParams, TenantExecutionRow, TenantSummaryRow } from './dashboardQueries';

interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  error: string | null;
}

export interface TenantExecutionsBundle {
  tenant: TenantSummaryRow;
  executions: PaginatedResult<TenantExecutionRow>;
}

function isPaginatedShape(val: unknown): val is { rows: unknown; totalCount: unknown } {
  return typeof val === 'object' && val !== null && 'rows' in val && 'totalCount' in val;
}

function isTenantExecutionsBundle(val: unknown): val is TenantExecutionsBundle {
  if (typeof val !== 'object' || val === null) return false;
  if (!('tenant' in val) || !('executions' in val)) return false;
  return isPaginatedShape(val.executions);
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function buildQuery(params: DashboardParams, tenantName: string): string {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.sortKey !== undefined) qs.set('sortKey', params.sortKey);
  if (params.sortDirection !== undefined) qs.set('sortDirection', params.sortDirection);
  qs.set('tenantName', tenantName);
  return qs.toString();
}

export async function getTenantExecutionsBundle(
  orgId: string,
  tenantName: string,
  params: DashboardParams
): Promise<{ result: TenantExecutionsBundle | null; error: string | null }> {
  try {
    const qs = buildQuery(params, tenantName);
    const url = `/dashboard/${encodeURIComponent(orgId)}/tenant-executions-bundle?${qs}`;
    const data = await fetchFromBackend('GET', url);
    if (!isTenantExecutionsBundle(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}
