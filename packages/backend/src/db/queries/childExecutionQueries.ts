import type { SupabaseClient } from './operationHelpers.js';

const INCREMENT = 1;

export interface PendingChildExecution {
  id: string;
  session_id: string;
  execution_id: string;
  parent_execution_id: string;
  agent_config: Record<string, unknown>;
  org_id: string;
  api_key_enc: string;
  app_type: 'agent' | 'workflow';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function createPendingChildExecution(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    executionId: string;
    parentExecutionId: string;
    agentConfig: Record<string, unknown>;
    orgId: string;
    apiKeyEnc: string;
    appType: 'agent' | 'workflow';
  }
): Promise<void> {
  const { error } = await supabase.from('pending_child_executions').insert({
    session_id: params.sessionId,
    execution_id: params.executionId,
    parent_execution_id: params.parentExecutionId,
    agent_config: params.agentConfig,
    org_id: params.orgId,
    api_key_enc: params.apiKeyEnc,
    app_type: params.appType,
  });
  if (error !== null) throw new Error(`Failed to create pending child execution: ${error.message}`);
}

export async function fetchAndClaimChildExecutions(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingChildExecution[]> {
  const result: QueryResult<PendingChildExecution[]> = await supabase
    .from('pending_child_executions')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim child executions: ${result.error.message}`);
  return result.data ?? [];
}

export async function updateChildExecutionStatus(
  supabase: SupabaseClient,
  id: string,
  status: 'completed' | 'failed' | 'pending'
): Promise<void> {
  const { error } = await supabase
    .from('pending_child_executions')
    .update({ status, last_attempt_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) throw new Error(`Failed to update child execution status: ${error.message}`);
}

export async function incrementChildAttempts(
  supabase: SupabaseClient,
  id: string,
  currentAttempts: number
): Promise<void> {
  const { error } = await supabase
    .from('pending_child_executions')
    .update({ attempts: currentAttempts + INCREMENT, last_attempt_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) throw new Error(`Failed to increment child execution attempts: ${error.message}`);
}
