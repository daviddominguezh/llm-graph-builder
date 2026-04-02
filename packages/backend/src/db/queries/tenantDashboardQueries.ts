import type {
  DashboardParams,
  PaginatedResult,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from './dashboardTypes.js';
import { paginationRange } from './dashboardTypes.js';
import type { SupabaseClient } from './operationHelpers.js';

const EMPTY_LENGTH = 0;
const DEFAULT_NUMERIC = 0;

/* ------------------------------------------------------------------ */
/*  Tenant Summary types & helpers                                     */
/* ------------------------------------------------------------------ */

type TenantSummaryRawRow = Record<string, unknown> & { tenant_id: string };

function isTenantSummaryRawArray(val: unknown): val is TenantSummaryRawRow[] {
  return Array.isArray(val);
}

function toNumber(val: unknown): number {
  return Number(val ?? DEFAULT_NUMERIC);
}

function toNullableString(val: unknown): string | null {
  if (typeof val === 'string') return val;
  return null;
}

function toString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return `${val}`;
  return '';
}

function mapTenantSummaryRow(r: TenantSummaryRawRow): TenantSummaryRow {
  return {
    tenant_id: r.tenant_id,
    tenant_name: toString(r.tenant_name),
    total_executions: toNumber(r.total_executions),
    failed_executions: toNumber(r.failed_executions),
    total_input_tokens: toNumber(r.total_input_tokens),
    total_output_tokens: toNumber(r.total_output_tokens),
    total_cost: toNumber(r.total_cost),
    unique_agents: toNumber(r.unique_agents),
    unique_users: toNumber(r.unique_users),
    unique_sessions: toNumber(r.unique_sessions),
    last_execution_at: toNullableString(r.last_execution_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Execution by Tenant types & helpers                                */
/* ------------------------------------------------------------------ */

interface AgentNameInfo {
  id: string;
  name: string;
}

type ExecutionRawRow = Record<string, unknown> & { agent_id: string };

const EXECUTION_FILTER_COLUMNS = ['channel', 'model', 'status', 'session_id'] as const;

function isAgentNameArray(val: unknown): val is AgentNameInfo[] {
  return Array.isArray(val);
}

function isExecutionRawArray(val: unknown): val is ExecutionRawRow[] {
  return Array.isArray(val);
}

async function fetchAgentNameMap(supabase: SupabaseClient, agentIds: string[]): Promise<Map<string, string>> {
  if (agentIds.length === EMPTY_LENGTH) return new Map();

  const result = await supabase.from('agents').select('id, name').in('id', agentIds);
  const rawData: unknown = result.data;
  const agents = isAgentNameArray(rawData) ? rawData : [];
  return new Map(agents.map((a) => [a.id, a.name]));
}

function mapExecutionRow(r: ExecutionRawRow, agentNameMap: Map<string, string>): TenantExecutionRow {
  return {
    id: toString(r.id),
    agent_id: r.agent_id,
    agent_name: agentNameMap.get(r.agent_id) ?? '',
    session_id: toString(r.session_id),
    user_id: toString(r.external_user_id),
    channel: toString(r.channel),
    version: toNumber(r.version),
    model: toString(r.model),
    status: toString(r.status),
    error: toNullableString(r.error),
    total_input_tokens: toNumber(r.total_input_tokens),
    total_output_tokens: toNumber(r.total_output_tokens),
    total_cost: toNumber(r.total_cost),
    total_duration_ms: toNumber(r.total_duration_ms),
    started_at: toString(r.started_at),
    completed_at: toNullableString(r.completed_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Tenant Summary query                                               */
/* ------------------------------------------------------------------ */

export async function getTenantSummary(
  supabase: SupabaseClient,
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantSummaryRow>> {
  const { from, to } = paginationRange(params);
  const sortCol = params.sortKey ?? 'total_executions';
  const ascending = params.sortDirection === 'asc';

  let query = supabase
    .from('tenant_execution_summary')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order(sortCol, { ascending })
    .range(from, to);

  const tenantNameFilter = params.filters?.tenant_name;
  if (tenantNameFilter !== undefined) {
    query = query.eq('tenant_name', String(tenantNameFilter));
  }

  const result = await query;

  if (result.error !== null) {
    return { rows: [], totalCount: DEFAULT_NUMERIC, error: result.error.message };
  }

  const rawData: unknown = result.data;
  const summaryRows = isTenantSummaryRawArray(rawData) ? rawData : [];
  const rows = summaryRows.map(mapTenantSummaryRow);
  const totalCount = typeof result.count === 'number' ? result.count : DEFAULT_NUMERIC;

  return { rows, totalCount, error: null };
}

/* ------------------------------------------------------------------ */
/*  Executions by Tenant – query builder                               */
/* ------------------------------------------------------------------ */

function buildSearchOrClause(search: string): string {
  const escaped = search.replace(/[%_]/gv, '\\$&');
  const pattern = `%${escaped}%`;

  return [
    `tenant_id.ilike.${pattern}`,
    `external_user_id.ilike.${pattern}`,
    `channel.ilike.${pattern}`,
    `model.ilike.${pattern}`,
    `session_id::text.ilike.${pattern}`,
  ].join(',');
}

function applyExecutionFilters(
  query: ReturnType<ReturnType<SupabaseClient['from']>['select']>,
  params: DashboardParams
): ReturnType<ReturnType<SupabaseClient['from']>['select']> {
  let filtered = query;

  for (const col of EXECUTION_FILTER_COLUMNS) {
    const val = params.filters?.[col];
    if (val !== undefined) {
      filtered = filtered.ilike(col, `%${String(val)}%`);
    }
  }

  const userIdFilter = params.filters?.user_id;
  if (userIdFilter !== undefined) {
    filtered = filtered.ilike('external_user_id', `%${String(userIdFilter)}%`);
  }

  if (params.search !== undefined) {
    filtered = filtered.or(buildSearchOrClause(params.search));
  }

  return filtered;
}

/* ------------------------------------------------------------------ */
/*  Executions by Tenant – main query                                  */
/* ------------------------------------------------------------------ */

export async function getExecutionsByTenant(
  supabase: SupabaseClient,
  orgId: string,
  tenantId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantExecutionRow>> {
  const { from, to } = paginationRange(params);
  const sortCol = params.sortKey ?? 'started_at';
  const ascending = params.sortDirection === 'asc';

  const baseQuery = supabase
    .from('agent_executions')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('tenant_id', tenantId)
    .order(sortCol, { ascending })
    .range(from, to);

  const query = applyExecutionFilters(baseQuery, params);
  const result = await query;

  if (result.error !== null) {
    return { rows: [], totalCount: DEFAULT_NUMERIC, error: result.error.message };
  }

  const rawData: unknown = result.data;
  const rawRows = isExecutionRawArray(rawData) ? rawData : [];
  const agentIds = [...new Set(rawRows.map((r) => r.agent_id))];
  const agentNameMap = await fetchAgentNameMap(supabase, agentIds);
  const rows = rawRows.map((r) => mapExecutionRow(r, agentNameMap));
  const totalCount = typeof result.count === 'number' ? result.count : DEFAULT_NUMERIC;

  return { rows, totalCount, error: null };
}

/* ------------------------------------------------------------------ */
/*  Time Series query                                                  */
/* ------------------------------------------------------------------ */

type TimeSeriesRawRow = Record<string, unknown>;

function mapTimeSeriesRow(r: TimeSeriesRawRow): TimeSeriesPoint {
  const dateVal: unknown = r.date;
  return {
    date: typeof dateVal === 'string' ? dateVal : '',
    executions: toNumber(r.executions),
    cost: toNumber(r.cost),
    users: toNumber(r.users),
    tenants: toNumber(r.tenants),
  };
}

export async function getDashboardTimeSeries(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ rows: TimeSeriesPoint[]; error: string | null }> {
  const result = await supabase.rpc('dashboard_timeseries', { p_org_id: orgId });

  if (result.error !== null) return { rows: [], error: result.error.message };

  const rawData: unknown = result.data;
  const rows = Array.isArray(rawData) ? rawData.map((r: TimeSeriesRawRow) => mapTimeSeriesRow(r)) : [];

  return { rows, error: null };
}
