import type { SupabaseClient } from './operationHelpers.js';

const INCREMENT = 1;
const ZERO = 0;

export interface PendingResume {
  id: string;
  session_id: string;
  parent_execution_id: string;
  parent_tool_output_message_id: string;
  child_output: string;
  child_status: 'success' | 'error';
  parent_session_state: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function createPendingResume(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    parentExecutionId: string;
    parentToolOutputMessageId: string;
    childOutput: string;
    childStatus: 'success' | 'error';
    parentSessionState: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from('pending_resumes').upsert(
    {
      session_id: params.sessionId,
      parent_execution_id: params.parentExecutionId,
      parent_tool_output_message_id: params.parentToolOutputMessageId,
      child_output: params.childOutput,
      child_status: params.childStatus,
      parent_session_state: params.parentSessionState,
      status: 'pending',
    },
    { onConflict: 'parent_execution_id' }
  );

  if (error !== null) throw new Error(`Failed to create pending resume: ${error.message}`);
}

export async function markResumeCompleted(
  supabase: SupabaseClient,
  parentExecutionId: string
): Promise<void> {
  const { error } = await supabase
    .from('pending_resumes')
    .update({ status: 'completed' })
    .eq('parent_execution_id', parentExecutionId);

  if (error !== null) throw new Error(`Failed to mark resume completed: ${error.message}`);
}

export async function fetchPendingResumes(supabase: SupabaseClient, limit: number): Promise<PendingResume[]> {
  const result: QueryResult<PendingResume[]> = await supabase
    .from('pending_resumes')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (result.error !== null) throw new Error(`Failed to fetch pending resumes: ${result.error.message}`);
  return result.data ?? [];
}

export async function updateResumeStatus(
  supabase: SupabaseClient,
  resumeId: string,
  newStatus: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<void> {
  const { error } = await supabase
    .from('pending_resumes')
    .update({ status: newStatus, last_attempt_at: new Date().toISOString() })
    .eq('id', resumeId);

  if (error !== null) throw new Error(`Failed to update resume status: ${error.message}`);
}

export async function incrementResumeAttempts(
  supabase: SupabaseClient,
  resumeId: string,
  currentAttempts: number
): Promise<void> {
  const { error } = await supabase
    .from('pending_resumes')
    .update({ attempts: currentAttempts + INCREMENT, last_attempt_at: new Date().toISOString() })
    .eq('id', resumeId);

  if (error !== null) throw new Error(`Failed to increment resume attempts: ${error.message}`);
}

export async function claimPendingResume(
  supabase: SupabaseClient,
  parentExecutionId: string
): Promise<PendingResume | null> {
  const result: QueryResult<PendingResume[]> = await supabase
    .from('pending_resumes')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('parent_execution_id', parentExecutionId)
    .eq('status', 'pending')
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim pending resume: ${result.error.message}`);
  const rows = result.data ?? [];
  return rows.length > ZERO ? (rows[ZERO] ?? null) : null;
}

export async function fetchAndClaimPendingResumes(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingResume[]> {
  const result: QueryResult<PendingResume[]> = await supabase
    .from('pending_resumes')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
    .select('*');

  if (result.error !== null) throw new Error(`Failed to claim pending resumes: ${result.error.message}`);
  return result.data ?? [];
}
