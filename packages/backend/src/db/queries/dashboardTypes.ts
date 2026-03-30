/* ------------------------------------------------------------------ */
/*  Types shared across dashboard queries                              */
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

export interface TimeSeriesPoint {
  date: string;
  executions: number;
  cost: number;
  users: number;
  tenants: number;
}

export interface DashboardParams {
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | string[]>;
  search?: string;
}

export interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Pagination helper                                                  */
/* ------------------------------------------------------------------ */

interface PaginationRange {
  from: number;
  to: number;
}

const RANGE_OFFSET = 1;

export function paginationRange(params: DashboardParams): PaginationRange {
  const from = params.page * params.pageSize;
  const to = from + params.pageSize - RANGE_OFFSET;
  return { from, to };
}
