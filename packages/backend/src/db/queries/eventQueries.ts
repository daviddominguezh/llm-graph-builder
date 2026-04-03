import type { SupabaseClient } from './operationHelpers.js';

export interface ExecutionEvent {
  executionId: string;
  orgId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function persistEvent(supabase: SupabaseClient, event: ExecutionEvent): Promise<void> {
  const { error } = await supabase.from('agent_execution_events').insert({
    execution_id: event.executionId,
    org_id: event.orgId,
    sequence: event.sequence,
    event_type: event.eventType,
    payload: event.payload,
  });

  if (error !== null) {
    process.stderr.write(`[events] Failed to persist event: ${error.message}\n`);
  }
}

export async function getEventsAfter(
  supabase: SupabaseClient,
  executionId: string,
  afterSequence: number
): Promise<ExecutionEvent[]> {
  const result: QueryResult<ExecutionEvent[]> = await supabase
    .from('agent_execution_events')
    .select('*')
    .eq('execution_id', executionId)
    .gt('sequence', afterSequence)
    .order('sequence', { ascending: true });

  if (result.error !== null) throw new Error(`Failed to get events: ${result.error.message}`);
  return result.data ?? [];
}
