import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentSummaryRow {
  [key: string]: unknown;
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  total_executions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  unique_tenants: number;
  unique_users: number;
  unique_sessions: number;
  last_execution_at: string | null;
}

export interface SessionRow {
  [key: string]: unknown;
  id: string;
  agent_id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  channel: string;
  current_node_id: string;
  version: number;
  model: string;
  created_at: string;
  updated_at: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  has_error: boolean;
}

export interface ExecutionSummaryRow {
  id: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  error: string | null;
}

export interface NodeVisitRow {
  node_id: string;
  step_order: number;
  messages_sent: unknown;
  response: unknown;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost: number;
  duration_ms: number;
  model: string;
}

export interface ExecutionMessageRow {
  id: string;
  execution_id: string;
  node_id: string;
  role: string;
  content: unknown;
  tool_calls: unknown;
  tool_call_id: string | null;
  created_at: string;
}

export interface DashboardParams {
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | string[]>;
  search?: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  error: string | null;
}

function isPaginatedResult(val: unknown): val is PaginatedResult<unknown> {
  return typeof val === 'object' && val !== null && 'rows' in val && 'totalCount' in val;
}

function isSessionRow(val: unknown): val is SessionRow {
  return typeof val === 'object' && val !== null && 'id' in val;
}

function isRowArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function buildQueryString(params: DashboardParams): string {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));

  if (params.sortKey !== undefined) {
    qs.set('sortKey', params.sortKey);
  }

  if (params.sortDirection !== undefined) {
    qs.set('sortDirection', params.sortDirection);
  }

  appendFilters(qs, params.filters);

  if (params.search !== undefined && params.search !== '') {
    qs.set('search', params.search);
  }

  return qs.toString();
}

function appendFilters(qs: URLSearchParams, filters: Record<string, string | string[]> | undefined): void {
  if (filters === undefined) return;

  for (const [key, val] of Object.entries(filters)) {
    if (typeof val === 'string') {
      qs.set(key, val);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  1. Agent Summary                                                   */
/* ------------------------------------------------------------------ */

export async function getAgentSummary(
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<AgentSummaryRow>> {
  try {
    const qs = buildQueryString(params);
    const url = `/dashboard/${encodeURIComponent(orgId)}/agent-summary?${qs}`;
    const data = await fetchFromBackend('GET', url);

    if (!isPaginatedResult(data)) {
      return { rows: [], totalCount: 0, error: 'Invalid response' };
    }

    return {
      rows: isRowArray(data.rows) ? (data.rows as AgentSummaryRow[]) : [],
      totalCount: data.totalCount,
      error: null,
    };
  } catch (err) {
    return { rows: [], totalCount: 0, error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  2. Sessions by Agent                                               */
/* ------------------------------------------------------------------ */

export async function getSessionsByAgent(
  orgId: string,
  agentId: string,
  params: DashboardParams
): Promise<PaginatedResult<SessionRow>> {
  try {
    const qs = buildQueryString(params);
    const orgEnc = encodeURIComponent(orgId);
    const agentEnc = encodeURIComponent(agentId);
    const url = `/dashboard/${orgEnc}/sessions/${agentEnc}?${qs}`;
    const data = await fetchFromBackend('GET', url);

    if (!isPaginatedResult(data)) {
      return { rows: [], totalCount: 0, error: 'Invalid response' };
    }

    return {
      rows: isRowArray(data.rows) ? (data.rows as SessionRow[]) : [],
      totalCount: data.totalCount,
      error: null,
    };
  } catch (err) {
    return { rows: [], totalCount: 0, error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  3. Session Detail                                                  */
/* ------------------------------------------------------------------ */

export async function getSessionDetail(
  sessionId: string
): Promise<{ session: SessionRow | null; error: string | null }> {
  try {
    const url = `/dashboard/sessions/${encodeURIComponent(sessionId)}`;
    const data = await fetchFromBackend('GET', url);

    if (!isSessionRow(data)) {
      return { session: null, error: 'Invalid response' };
    }

    return { session: data, error: null };
  } catch (err) {
    return { session: null, error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  4. Executions for Session                                          */
/* ------------------------------------------------------------------ */

export async function getExecutionsForSession(
  sessionId: string
): Promise<{ rows: ExecutionSummaryRow[]; error: string | null }> {
  try {
    const url = `/dashboard/sessions/${encodeURIComponent(sessionId)}/executions`;
    const data = await fetchFromBackend('GET', url);

    if (!isRowArray(data)) {
      return { rows: [], error: 'Invalid response' };
    }

    return { rows: data as ExecutionSummaryRow[], error: null };
  } catch (err) {
    return { rows: [], error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  5. Node Visits for Execution                                       */
/* ------------------------------------------------------------------ */

export async function getNodeVisitsForExecution(
  executionId: string
): Promise<{ rows: NodeVisitRow[]; error: string | null }> {
  try {
    const url = `/dashboard/executions/${encodeURIComponent(executionId)}/node-visits`;
    const data = await fetchFromBackend('GET', url);

    if (!isRowArray(data)) {
      return { rows: [], error: 'Invalid response' };
    }

    return { rows: data as NodeVisitRow[], error: null };
  } catch (err) {
    return { rows: [], error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  5b. Messages for Execution                                         */
/* ------------------------------------------------------------------ */

export async function getMessagesForExecution(
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  try {
    const url = `/dashboard/executions/${encodeURIComponent(executionId)}/messages`;
    const data = await fetchFromBackend('GET', url);

    if (!isRowArray(data)) {
      return { rows: [], error: 'Invalid response' };
    }

    return { rows: data as ExecutionMessageRow[], error: null };
  } catch (err) {
    return { rows: [], error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  6. Tenant Summary                                                  */
/* ------------------------------------------------------------------ */

export interface TenantSummaryRow {
  [key: string]: unknown;
  tenant_id: string;
  total_executions: number;
  failed_executions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  unique_agents: number;
  unique_users: number;
  unique_sessions: number;
  last_execution_at: string | null;
}

export async function getTenantSummary(
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantSummaryRow>> {
  try {
    const qs = buildQueryString(params);
    const url = `/dashboard/${encodeURIComponent(orgId)}/tenant-summary?${qs}`;
    const data = await fetchFromBackend('GET', url);

    if (!isPaginatedResult(data)) {
      return { rows: [], totalCount: 0, error: 'Invalid response' };
    }

    return {
      rows: isRowArray(data.rows) ? (data.rows as TenantSummaryRow[]) : [],
      totalCount: data.totalCount,
      error: null,
    };
  } catch (err) {
    return { rows: [], totalCount: 0, error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  7. Executions by Tenant                                            */
/* ------------------------------------------------------------------ */

export interface TenantExecutionRow {
  [key: string]: unknown;
  id: string;
  agent_id: string;
  agent_name: string;
  session_id: string;
  user_id: string;
  channel: string;
  version: number;
  model: string;
  status: string;
  error: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string | null;
}

export async function getExecutionsByTenant(
  orgId: string,
  tenantId: string,
  params: DashboardParams
): Promise<PaginatedResult<TenantExecutionRow>> {
  try {
    const qs = buildQueryString(params);
    const orgEnc = encodeURIComponent(orgId);
    const tenantEnc = encodeURIComponent(tenantId);
    const url = `/dashboard/${orgEnc}/tenants/${tenantEnc}/executions?${qs}`;
    const data = await fetchFromBackend('GET', url);

    if (!isPaginatedResult(data)) {
      return { rows: [], totalCount: 0, error: 'Invalid response' };
    }

    return {
      rows: isRowArray(data.rows) ? (data.rows as TenantExecutionRow[]) : [],
      totalCount: data.totalCount,
      error: null,
    };
  } catch (err) {
    return { rows: [], totalCount: 0, error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  8. Delete Session                                                  */
/* ------------------------------------------------------------------ */

export async function deleteSession(sessionId: string): Promise<{ error: string | null }> {
  try {
    const url = `/dashboard/sessions/${encodeURIComponent(sessionId)}`;
    await fetchFromBackend('DELETE', url);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  9. Time Series                                                     */
/* ------------------------------------------------------------------ */

export interface TimeSeriesPoint {
  date: string;
  executions: number;
  cost: number;
  users: number;
  tenants: number;
}

export async function getDashboardTimeSeries(
  orgId: string
): Promise<{ rows: TimeSeriesPoint[]; error: string | null }> {
  try {
    const url = `/dashboard/${encodeURIComponent(orgId)}/timeseries`;
    const data = await fetchFromBackend('GET', url);

    if (typeof data !== 'object' || data === null || !('rows' in data)) {
      return { rows: [], error: 'Invalid response' };
    }

    return {
      rows: Array.isArray((data as Record<string, unknown>).rows)
        ? ((data as Record<string, unknown>).rows as TimeSeriesPoint[])
        : [],
      error: null,
    };
  } catch (err) {
    return { rows: [], error: extractError(err) };
  }
}
