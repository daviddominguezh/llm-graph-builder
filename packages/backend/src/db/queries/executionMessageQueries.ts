import type { SupabaseClient } from './operationHelpers.js';

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

export async function getExecutionMessages(
  supabase: SupabaseClient,
  executionId: string
): Promise<MessageRow[]> {
  const result: QueryResult<MessageRow[]> = await supabase
    .from('agent_execution_messages')
    .select('*')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });

  if (result.error !== null) {
    throw new Error(`getExecutionMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function fetchChildExecutionIds(
  supabase: SupabaseClient,
  parentExecutionId: string,
  excludeExecutionId: string | undefined
): Promise<string[]> {
  const base = supabase.from('agent_executions').select('id').eq('parent_execution_id', parentExecutionId);
  const filtered = excludeExecutionId === undefined ? base : base.neq('id', excludeExecutionId);
  const execResult = (await filtered) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };

  if (execResult.error !== null) {
    throw new Error(`getChildExecutionMessages(execs): ${execResult.error.message}`);
  }

  return (execResult.data ?? []).map((r) => r.id);
}

const NO_CHILD_EXECUTIONS = 0;

export async function getChildExecutionMessages(
  supabase: SupabaseClient,
  parentExecutionId: string,
  excludeExecutionId?: string
): Promise<MessageRow[]> {
  const childExecIds = await fetchChildExecutionIds(supabase, parentExecutionId, excludeExecutionId);
  if (childExecIds.length === NO_CHILD_EXECUTIONS) return [];

  const result: QueryResult<MessageRow[]> = await supabase
    .from('agent_execution_messages')
    .select('*')
    .in('execution_id', childExecIds)
    .order('created_at', { ascending: true });

  if (result.error !== null) {
    throw new Error(`getChildExecutionMessages(msgs): ${result.error.message}`);
  }

  return result.data ?? [];
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
