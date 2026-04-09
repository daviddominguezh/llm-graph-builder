import type { SupabaseClient } from './operationHelpers.js';

const ZERO = 0;
const ONE = 1;

export interface StackEntry {
  id: string;
  session_id: string;
  depth: number;
  execution_id: string;
  parent_execution_id: string | null;
  parent_tool_output_message_id: string | null;
  parent_session_state: Record<string, unknown> | null;
  agent_config: Record<string, unknown>;
  app_type: 'agent' | 'workflow';
  dispatched_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function getStackTop(supabase: SupabaseClient, sessionId: string): Promise<StackEntry | null> {
  const result: QueryResult<StackEntry> = await supabase
    .from('agent_stack_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('depth', { ascending: false })
    .limit(ONE)
    .maybeSingle();

  if (result.error !== null) throw new Error(`Failed to get stack top: ${result.error.message}`);
  return result.data;
}

export async function getStackDepth(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('agent_stack_entries')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error !== null) throw new Error(`Failed to get stack depth: ${error.message}`);
  return typeof count === 'number' ? count : ZERO;
}

export interface PushStackEntryParams {
  sessionId: string;
  depth: number;
  executionId: string;
  parentExecutionId: string;
  parentToolOutputMessageId: string;
  parentSessionState: Record<string, unknown>;
  agentConfig: Record<string, unknown>;
  appType: 'agent' | 'workflow';
}

export async function pushStackEntry(supabase: SupabaseClient, params: PushStackEntryParams): Promise<void> {
  const { error } = await supabase.from('agent_stack_entries').insert({
    session_id: params.sessionId,
    depth: params.depth,
    execution_id: params.executionId,
    parent_execution_id: params.parentExecutionId,
    parent_tool_output_message_id: params.parentToolOutputMessageId,
    parent_session_state: params.parentSessionState,
    agent_config: params.agentConfig,
    app_type: params.appType,
  });

  if (error !== null) throw new Error(`Failed to push stack entry: ${error.message}`);
}

function isStackEntry(value: unknown): value is StackEntry {
  return typeof value === 'object' && value !== null && 'id' in value && 'session_id' in value;
}

export async function popStackEntry(supabase: SupabaseClient, sessionId: string): Promise<StackEntry | null> {
  const { data, error } = (await supabase.rpc('pop_stack_entry', { p_session_id: sessionId })) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error !== null) throw new Error(`Failed to pop stack entry: ${error.message}`);
  const rows: unknown = Array.isArray(data) ? data : [];
  const first: unknown = Array.isArray(rows) ? rows[ZERO] : undefined;
  if (!isStackEntry(first)) return null;
  return first;
}
