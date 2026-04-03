import type { SupabaseClient } from './operationHelpers.js';

export interface PendingResume {
  id: string;
  sessionId: string;
  parentExecutionId: string;
  parentToolOutputMessageId: string;
  childOutput: string;
  childStatus: 'success' | 'error';
  parentSessionState: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
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

export async function fetchPendingResumes(
  supabase: SupabaseClient,
  limit: number
): Promise<PendingResume[]> {
  const { data, error } = await supabase
    .from('pending_resumes')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error !== null) throw new Error(`Failed to fetch pending resumes: ${error.message}`);
  return (data ?? []) as PendingResume[];
}

export async function updateResumeStatus(
  supabase: SupabaseClient,
  resumeId: string,
  status: 'processing' | 'completed' | 'failed'
): Promise<void> {
  const updateData: Record<string, unknown> = { status, last_attempt_at: new Date().toISOString() };
  const { error } = await supabase
    .from('pending_resumes')
    .update(updateData)
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
    .update({ attempts: currentAttempts + 1, last_attempt_at: new Date().toISOString() })
    .eq('id', resumeId);

  if (error !== null) throw new Error(`Failed to increment resume attempts: ${error.message}`);
}
