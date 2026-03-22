import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentSummaryRow {
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
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  channel: string;
  current_node_id: string;
  version: number;
  model: string;
  created_at: string;
  updated_at: string;
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

export interface DashboardParams {
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | string[]>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  error: string | null;
}

function paginationRange(params: DashboardParams): { from: number; to: number } {
  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;
  return { from, to };
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

  let query = supabase
    .from('agent_execution_summary')
    .select('*, agents!inner(name, slug)', { count: 'exact' })
    .eq('agents.org_id', orgId)
    .order(sortCol, { ascending })
    .range(from, to);

  if (params.filters?.['agent'] !== undefined) {
    query = query.ilike('agents.name', `%${String(params.filters['agent'])}%`);
  }

  const { data, count, error } = await query;

  if (error !== null) {
    return { rows: [], totalCount: 0, error: error.message };
  }

  type RawRow = Record<string, unknown> & { agents: { name: string; slug: string } };
  const raw = (data as RawRow[] | null) ?? [];

  const rows: AgentSummaryRow[] = raw.map((r) => ({
    agent_id: String(r['agent_id'] ?? ''),
    agent_name: r.agents.name,
    agent_slug: r.agents.slug,
    total_executions: Number(r['total_executions'] ?? 0),
    total_input_tokens: Number(r['total_input_tokens'] ?? 0),
    total_output_tokens: Number(r['total_output_tokens'] ?? 0),
    total_cost: Number(r['total_cost'] ?? 0),
    unique_tenants: Number(r['unique_tenants'] ?? 0),
    unique_users: Number(r['unique_users'] ?? 0),
    unique_sessions: Number(r['unique_sessions'] ?? 0),
    last_execution_at: r['last_execution_at'] !== null ? String(r['last_execution_at']) : null,
  }));

  return { rows, totalCount: count ?? 0, error: null };
}

/* ------------------------------------------------------------------ */
/*  2. Sessions by Agent                                               */
/* ------------------------------------------------------------------ */

const SESSION_FILTER_COLUMNS = ['tenant_id', 'user_id', 'channel', 'model'] as const;

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
    .from('agent_sessions')
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

  const { data, count, error } = await query;

  if (error !== null) {
    return { rows: [], totalCount: 0, error: error.message };
  }

  const rows = (data as SessionRow[] | null) ?? [];
  return { rows, totalCount: count ?? 0, error: null };
}

/* ------------------------------------------------------------------ */
/*  3. Session Detail                                                  */
/* ------------------------------------------------------------------ */

export async function getSessionDetail(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ session: SessionRow | null; error: string | null }> {
  const { data, error } = await supabase.from('agent_sessions').select('*').eq('id', sessionId).single();

  if (error !== null) return { session: null, error: error.message };
  return { session: data as SessionRow, error: null };
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
  return { rows: (data as ExecutionSummaryRow[] | null) ?? [], error: null };
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
  return { rows: (data as NodeVisitRow[] | null) ?? [], error: null };
}
