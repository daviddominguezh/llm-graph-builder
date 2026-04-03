import type { SupabaseClient } from './operationHelpers.js';

export interface StackEntry {
  id: string;
  sessionId: string;
  depth: number;
  executionId: string;
  parentExecutionId: string | null;
  parentToolOutputMessageId: string | null;
  parentSessionState: Record<string, unknown> | null;
  agentConfig: Record<string, unknown>;
  appType: 'agent' | 'workflow';
  dispatchedAt: string;
}

export async function getStackTop(supabase: SupabaseClient, sessionId: string): Promise<StackEntry | null> {
  const { data, error } = await supabase
    .from('agent_stack_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('depth', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) throw new Error(`Failed to get stack top: ${error.message}`);
  return data as StackEntry | null;
}

export async function getStackDepth(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('agent_stack_entries')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error !== null) throw new Error(`Failed to get stack depth: ${error.message}`);
  return count ?? 0;
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

export async function popStackEntry(supabase: SupabaseClient, sessionId: string): Promise<StackEntry | null> {
  const top = await getStackTop(supabase, sessionId);
  if (top === null) return null;

  const { error } = await supabase.from('agent_stack_entries').delete().eq('id', top.id);

  if (error !== null) throw new Error(`Failed to pop stack entry: ${error.message}`);
  return top;
}
