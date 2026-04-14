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
  root_execution_id: string;
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
    rootExecutionId: string;
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
    root_execution_id: params.rootExecutionId,
  });
  if (error !== null) throw new Error(`Failed to create pending child execution: ${error.message}`);
}

function isPendingChildExecution(value: unknown): value is PendingChildExecution {
  return typeof value === 'object' && value !== null && 'id' in value && 'session_id' in value;
}

export async function fetchAndClaimChildExecutions(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingChildExecution[]> {
  const { data, error } = (await supabase.rpc('claim_pending_child_executions', { p_limit: limit })) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error !== null) throw new Error(`Failed to claim child executions: ${error.message}`);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.filter(isPendingChildExecution);
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

export interface ExecutionDetails {
  agent_id: string;
  version: number;
  channel: string;
  tenant_id: string;
  external_user_id: string;
}

export async function getExecutionDetails(
  supabase: SupabaseClient,
  executionId: string
): Promise<ExecutionDetails> {
  const result: QueryResult<ExecutionDetails> = await supabase
    .from('agent_executions')
    .select('agent_id, version, channel, tenant_id, external_user_id')
    .eq('id', executionId)
    .single();
  if (result.error !== null || result.data === null) {
    throw new Error(`Failed to get execution details: ${result.error?.message ?? 'not found'}`);
  }
  return result.data;
}
