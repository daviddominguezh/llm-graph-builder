import type { SupabaseClient } from './operationHelpers.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}
export interface SessionRow {
  id: string;
  agent_id: string;
  version: number;
  tenant_id: string;
  user_id: string;
  session_id: string;
  channel: string;
  model: string;
  current_node_id: string;
  structured_outputs: Record<string, unknown[]>;
  created_at: string;
  updated_at: string;
}
interface GetOrCreateSessionParams {
  agentId: string;
  orgId: string;
  version: number;
  tenantId: string;
  userId: string;
  sessionId: string;
  channel: string;
  model: string;
}
export interface SessionResult {
  session: SessionRow | null;
  isNew: boolean;
  locked?: boolean;
}
const INITIAL_NODE = 'INITIAL_STEP';
const LOCK_ERROR_CODE = '55P03';
const NOT_FOUND_CODE = 'PGRST116';

async function tryLockExistingSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionResult | null> {
  const result: QueryResult<SessionRow> = await supabase.rpc('lock_session_for_update', {
    p_agent_id: params.agentId,
    p_version: params.version,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_session_id: params.sessionId,
    p_channel: params.channel,
  });

  if (result.error !== null) {
    if (result.error.code === LOCK_ERROR_CODE) {
      return { session: null, isNew: false, locked: true };
    }
    if (result.error.code === NOT_FOUND_CODE) return null;
    throw new Error(`tryLockExistingSession: ${result.error.message}`);
  }

  const rows = result.data as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { session: rows[0] as SessionRow, isNew: false };
}

async function insertNewSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionRow> {
  const result: QueryResult<SessionRow> = await supabase
    .from('agent_sessions')
    .insert({
      agent_id: params.agentId,
      org_id: params.orgId,
      version: params.version,
      tenant_id: params.tenantId,
      user_id: params.userId,
      session_id: params.sessionId,
      channel: params.channel,
      model: params.model,
      current_node_id: INITIAL_NODE,
      structured_outputs: {},
    })
    .select()
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`insertNewSession: ${result.error?.message ?? 'No data returned'}`);
  }

  return result.data;
}

export async function getOrCreateSession(
  supabase: SupabaseClient,
  params: GetOrCreateSessionParams
): Promise<SessionResult> {
  const existing = await tryLockExistingSession(supabase, params);
  if (existing !== null) return existing;

  const session = await insertNewSession(supabase, params);
  return { session, isNew: true };
}

interface MessageRow {
  id: string;
  session_id: string;
  execution_id: string;
  node_id: string;
  role: string;
  content: Record<string, unknown>;
  created_at: string;
}
export async function getSessionMessages(supabase: SupabaseClient, sessionId: string): Promise<MessageRow[]> {
  const result: QueryResult<MessageRow[]> = await supabase
    .from('agent_execution_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (result.error !== null) {
    throw new Error(`getSessionMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}

interface CreateExecutionParams {
  sessionId: string;
  agentId: string;
  orgId: string;
  version: number;
  model: string;
  channel: string;
  tenantId: string;
  userId: string;
}

export async function createExecution(
  supabase: SupabaseClient,
  params: CreateExecutionParams
): Promise<string> {
  const result: QueryResult<{ id: string }> = await supabase
    .from('agent_executions')
    .insert({
      session_id: params.sessionId,
      agent_id: params.agentId,
      org_id: params.orgId,
      version: params.version,
      model: params.model,
      channel: params.channel,
      tenant_id: params.tenantId,
      external_user_id: params.userId,
      status: 'running',
    })
    .select('id')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`createExecution: ${result.error?.message ?? 'No data returned'}`);
  }

  return result.data.id;
}

interface SaveMessageParams {
  sessionId: string;
  executionId: string;
  nodeId: string;
  role: string;
  content: string;
}

export async function saveExecutionMessage(
  supabase: SupabaseClient,
  params: SaveMessageParams
): Promise<void> {
  const result = await supabase.from('agent_execution_messages').insert({
    session_id: params.sessionId,
    execution_id: params.executionId,
    node_id: params.nodeId,
    role: params.role,
    content: { text: params.content },
  });

  if (result.error !== null) {
    throw new Error(`saveExecutionMessage: ${result.error.message}`);
  }
}

interface SaveNodeVisitParams {
  executionId: string;
  nodeId: string;
  stepOrder: number;
  messagesSent: unknown;
  response: unknown;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  durationMs: number;
  model: string;
}

export async function saveNodeVisit(supabase: SupabaseClient, params: SaveNodeVisitParams): Promise<void> {
  const result = await supabase.from('agent_execution_nodes').insert({
    execution_id: params.executionId,
    node_id: params.nodeId,
    step_order: params.stepOrder,
    messages_sent: params.messagesSent,
    response: params.response,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cached_tokens: params.cachedTokens,
    cost: params.cost,
    duration_ms: params.durationMs,
    model: params.model,
  });

  if (result.error !== null) {
    throw new Error(`saveNodeVisit: ${result.error.message}`);
  }
}

interface CompletionTotals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalCost: number;
  durationMs: number;
}

export async function completeExecution(
  supabase: SupabaseClient,
  executionId: string,
  totals: CompletionTotals
): Promise<void> {
  const result = await supabase
    .from('agent_executions')
    .update({
      status: 'completed',
      total_input_tokens: totals.inputTokens,
      total_output_tokens: totals.outputTokens,
      total_cached_tokens: totals.cachedTokens,
      total_cost: totals.totalCost,
      total_duration_ms: totals.durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  if (result.error !== null) {
    throw new Error(`completeExecution: ${result.error.message}`);
  }
}

export async function failExecution(
  supabase: SupabaseClient,
  executionId: string,
  error: string
): Promise<void> {
  const result = await supabase
    .from('agent_executions')
    .update({
      status: 'failed',
      error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  if (result.error !== null) {
    throw new Error(`failExecution: ${result.error.message}`);
  }
}

export async function refreshExecutionSummary(supabase: SupabaseClient): Promise<void> {
  await supabase.rpc('refresh_execution_summary');
}

interface UpdateSessionStateParams {
  currentNodeId: string;
  structuredOutputs: Record<string, unknown[]>;
}

export async function updateSessionState(
  supabase: SupabaseClient,
  sessionId: string,
  state: UpdateSessionStateParams
): Promise<void> {
  const result = await supabase
    .from('agent_sessions')
    .update({
      current_node_id: state.currentNodeId,
      structured_outputs: state.structuredOutputs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (result.error !== null) {
    throw new Error(`updateSessionState: ${result.error.message}`);
  }
}
