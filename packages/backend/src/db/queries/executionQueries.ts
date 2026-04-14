import type { SupabaseClient } from './operationHelpers.js';

export type { SessionRow, SessionResult } from './executionSessionQueries.js';
export { getOrCreateSession } from './executionSessionQueries.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface MessageRow {
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
  parentExecutionId?: string;
  isDynamicChild?: boolean;
  executionId?: string;
}

export async function createExecution(
  supabase: SupabaseClient,
  params: CreateExecutionParams
): Promise<string> {
  const insertRow = {
    session_id: params.sessionId,
    agent_id: params.agentId,
    org_id: params.orgId,
    version: params.version,
    model: params.model,
    channel: params.channel,
    tenant_id: params.tenantId,
    external_user_id: params.userId,
    status: 'running',
    parent_execution_id: params.parentExecutionId ?? null,
    is_dynamic_child: params.isDynamicChild ?? false,
    ...(params.executionId === undefined ? {} : { id: params.executionId }),
  };

  const result: QueryResult<{ id: string }> = await supabase
    .from('agent_executions')
    .insert(insertRow)
    .select('id')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`createExecution: ${result.error?.message ?? 'No data returned'}`);
  }

  return result.data.id;
}

export async function getExecutionMessages(
  supabase: SupabaseClient,
  executionId: string
): Promise<MessageRow[]> {
  const result: QueryResult<MessageRow[]> = await supabase
    .from('agent_execution_messages')
    .select('*')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (result.error !== null) throw new Error(`Failed to get execution messages: ${result.error.message}`);
  return result.data ?? [];
}

export async function updateToolOutputMessage(
  supabase: SupabaseClient,
  messageId: string,
  newContent: unknown
): Promise<void> {
  const result = await supabase
    .from('agent_execution_messages')
    .update({ content: newContent })
    .eq('id', messageId);

  if (result.error !== null) throw new Error(`Failed to update tool output message: ${result.error.message}`);
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

interface SaveRawMessageParams {
  sessionId: string;
  executionId: string;
  nodeId: string;
  role: string;
  content: Record<string, unknown>;
}

export async function saveExecutionMessageRaw(
  supabase: SupabaseClient,
  params: SaveRawMessageParams
): Promise<string> {
  const result: QueryResult<{ id: string }> = await supabase
    .from('agent_execution_messages')
    .insert({
      session_id: params.sessionId,
      execution_id: params.executionId,
      node_id: params.nodeId,
      role: params.role,
      content: params.content,
    })
    .select('id')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`saveExecutionMessageRaw: ${result.error?.message ?? 'No data'}`);
  }
  return result.data.id;
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
