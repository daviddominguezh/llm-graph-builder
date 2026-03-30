import type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
} from './dashboardTypes.js';
import { paginationRange } from './dashboardTypes.js';
import type { SupabaseClient } from './operationHelpers.js';

export type {
  AgentSummaryRow,
  DashboardParams,
  ExecutionMessageRow,
  ExecutionSummaryRow,
  NodeVisitRow,
  PaginatedResult,
  SessionRow,
  TenantExecutionRow,
  TenantSummaryRow,
  TimeSeriesPoint,
} from './dashboardTypes.js';

export { getDashboardTimeSeries, getExecutionsByTenant, getTenantSummary } from './tenantDashboardQueries.js';

const EMPTY_LENGTH = 0;
const DEFAULT_NUMERIC = 0;

/* ------------------------------------------------------------------ */
/*  Agent Summary helpers                                              */
/* ------------------------------------------------------------------ */

interface AgentInfo {
  id: string;
  name: string;
  slug: string;
}

type SummaryRawRow = Record<string, unknown> & { agent_id: string };

function isAgentInfoArray(val: unknown): val is AgentInfo[] {
  return Array.isArray(val);
}

async function fetchAgentNames(
  supabase: SupabaseClient,
  agentIds: string[]
): Promise<Map<string, AgentInfo>> {
  if (agentIds.length === EMPTY_LENGTH) return new Map();

  const result = await supabase.from('agents').select('id, name, slug').in('id', agentIds);
  const rawData: unknown = result.data;
  const agents = isAgentInfoArray(rawData) ? rawData : [];
  return new Map(agents.map((a) => [a.id, a]));
}

function toNumber(val: unknown): number {
  return Number(val ?? DEFAULT_NUMERIC);
}

function toNullableString(val: unknown): string | null {
  if (typeof val === 'string') return val;
  return null;
}

interface SummaryNumericFields {
  total_executions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  unique_tenants: number;
  unique_users: number;
  unique_sessions: number;
}

function mapSummaryNumericFields(r: SummaryRawRow): SummaryNumericFields {
  return {
    total_executions: toNumber(r.total_executions),
    total_input_tokens: toNumber(r.total_input_tokens),
    total_output_tokens: toNumber(r.total_output_tokens),
    total_cost: toNumber(r.total_cost),
    unique_tenants: toNumber(r.unique_tenants),
    unique_users: toNumber(r.unique_users),
    unique_sessions: toNumber(r.unique_sessions),
  };
}

function mapSummaryRow(r: SummaryRawRow, agentMap: Map<string, AgentInfo>): AgentSummaryRow {
  const agent = agentMap.get(r.agent_id);
  const numericFields = mapSummaryNumericFields(r);
  return {
    agent_id: r.agent_id,
    agent_name: agent?.name ?? '',
    agent_slug: agent?.slug ?? '',
    total_executions: numericFields.total_executions,
    total_input_tokens: numericFields.total_input_tokens,
    total_output_tokens: numericFields.total_output_tokens,
    total_cost: numericFields.total_cost,
    unique_tenants: numericFields.unique_tenants,
    unique_users: numericFields.unique_users,
    unique_sessions: numericFields.unique_sessions,
    last_execution_at: toNullableString(r.last_execution_at),
  };
}

function isSummaryRawRowArray(val: unknown): val is SummaryRawRow[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Session helpers                                                    */
/* ------------------------------------------------------------------ */

const SESSION_FILTER_COLUMNS = ['tenant_id', 'user_id', 'channel', 'model'] as const;

interface FailedSessionRow {
  session_id: string;
}

function isFailedSessionArray(val: unknown): val is FailedSessionRow[] {
  return Array.isArray(val);
}

async function fetchFailedSessionIds(supabase: SupabaseClient, sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === EMPTY_LENGTH) return new Set();

  const result = await supabase
    .from('agent_executions')
    .select('session_id')
    .in('session_id', sessionIds)
    .eq('status', 'failed');

  const rawData: unknown = result.data;
  const rows = isFailedSessionArray(rawData) ? rawData : [];
  return new Set(rows.map((r) => r.session_id));
}

function isSessionRowArray(val: unknown): val is SessionRow[] {
  return Array.isArray(val);
}

function isSessionRow(val: unknown): val is SessionRow {
  return typeof val === 'object' && val !== null && 'id' in val;
}

function isExecutionArray(val: unknown): val is ExecutionSummaryRow[] {
  return Array.isArray(val);
}

function isNodeVisitArray(val: unknown): val is NodeVisitRow[] {
  return Array.isArray(val);
}

function isMessageArray(val: unknown): val is ExecutionMessageRow[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  1. Agent Summary                                                   */
/* ------------------------------------------------------------------ */

export async function getAgentSummary(
  supabase: SupabaseClient,
  orgId: string,
  params: DashboardParams
): Promise<PaginatedResult<AgentSummaryRow>> {
  const { from, to } = paginationRange(params);
  const sortCol = params.sortKey ?? 'total_executions';
  const ascending = params.sortDirection === 'asc';

  const query = supabase
    .from('agent_execution_summary')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order(sortCol, { ascending })
    .range(from, to);

  const result = await query;

  if (result.error !== null) {
    return { rows: [], totalCount: DEFAULT_NUMERIC, error: result.error.message };
  }

  const rawData: unknown = result.data;
  const summaryRows = isSummaryRawRowArray(rawData) ? rawData : [];
  const agentIds = summaryRows.map((r) => r.agent_id);
  const agentMap = await fetchAgentNames(supabase, agentIds);
  const rows = summaryRows.map((r) => mapSummaryRow(r, agentMap));
  const totalCount = typeof result.count === 'number' ? result.count : DEFAULT_NUMERIC;

  return { rows, totalCount, error: null };
}

/* ------------------------------------------------------------------ */
/*  2. Sessions by Agent                                               */
/* ------------------------------------------------------------------ */

export async function getSessionsByAgent(
  supabase: SupabaseClient,
  orgId: string,
  agentId: string,
  params: DashboardParams
): Promise<PaginatedResult<SessionRow>> {
  const { from, to } = paginationRange(params);
  const sortCol = params.sortKey ?? 'updated_at';
  const ascending = params.sortDirection === 'asc';

  let query = supabase
    .from('agent_sessions_with_cost')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('agent_id', agentId)
    .order(sortCol, { ascending })
    .range(from, to);

  for (const col of SESSION_FILTER_COLUMNS) {
    const val = params.filters?.[col];
    if (val !== undefined) {
      query = query.ilike(col, `%${String(val)}%`);
    }
  }

  const result = await query;

  if (result.error !== null) {
    return { rows: [], totalCount: DEFAULT_NUMERIC, error: result.error.message };
  }

  const rawData: unknown = result.data;
  const rawRows = isSessionRowArray(rawData) ? rawData : [];
  const sessionIds = rawRows.map((r) => r.id);
  const failedIds = await fetchFailedSessionIds(supabase, sessionIds);
  const rows = rawRows.map((r) => ({ ...r, has_error: failedIds.has(r.id) }));
  const totalCount = typeof result.count === 'number' ? result.count : DEFAULT_NUMERIC;

  return { rows, totalCount, error: null };
}

/* ------------------------------------------------------------------ */
/*  3. Session Detail                                                  */
/* ------------------------------------------------------------------ */

export async function getSessionDetail(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ session: SessionRow | null; error: string | null }> {
  const result = await supabase.from('agent_sessions_with_cost').select('*').eq('id', sessionId).single();

  if (result.error !== null) return { session: null, error: result.error.message };
  const rawData: unknown = result.data;
  if (!isSessionRow(rawData)) return { session: null, error: 'Invalid data' };
  return { session: rawData, error: null };
}

/* ------------------------------------------------------------------ */
/*  4. Executions for Session                                          */
/* ------------------------------------------------------------------ */

export async function getExecutionsForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ rows: ExecutionSummaryRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_executions')
    .select('*')
    .eq('session_id', sessionId)
    .order('started_at', { ascending: true });

  if (error !== null) return { rows: [], error: error.message };
  return { rows: isExecutionArray(data) ? data : [], error: null };
}

/* ------------------------------------------------------------------ */
/*  5. Node Visits for Execution                                       */
/* ------------------------------------------------------------------ */

export async function getNodeVisitsForExecution(
  supabase: SupabaseClient,
  executionId: string
): Promise<{ rows: NodeVisitRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_nodes')
    .select('*')
    .eq('execution_id', executionId)
    .order('step_order', { ascending: true });

  if (error !== null) return { rows: [], error: error.message };
  return { rows: isNodeVisitArray(data) ? data : [], error: null };
}

/* ------------------------------------------------------------------ */
/*  6b. Messages for Execution                                         */
/* ------------------------------------------------------------------ */

export async function getMessagesForExecution(
  supabase: SupabaseClient,
  executionId: string
): Promise<{ rows: ExecutionMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_messages')
    .select('id, execution_id, node_id, role, content, tool_calls, tool_call_id, created_at')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (error !== null) return { rows: [], error: error.message };
  return { rows: isMessageArray(data) ? data : [], error: null };
}

/* ------------------------------------------------------------------ */
/*  6. Delete Session                                                  */
/* ------------------------------------------------------------------ */

export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_sessions').delete().eq('id', sessionId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
