import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ConversationAssigneeRow, ConversationStatusRow } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function addAssignee(
  supabase: SupabaseClient,
  conversationId: string,
  assignee: string
): Promise<ConversationAssigneeRow> {
  const result: QueryResult<ConversationAssigneeRow> = await supabase
    .from('conversation_assignees')
    .insert({ conversation_id: conversationId, assignee })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`addAssignee: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function addStatus(
  supabase: SupabaseClient,
  conversationId: string,
  status: string
): Promise<ConversationStatusRow> {
  const result: QueryResult<ConversationStatusRow> = await supabase
    .from('conversation_statuses')
    .insert({ conversation_id: conversationId, status })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`addStatus: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function getAssignees(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationAssigneeRow[]> {
  const result: QueryResult<ConversationAssigneeRow[]> = await supabase
    .from('conversation_assignees')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  return result.data ?? [];
}

export async function getStatuses(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationStatusRow[]> {
  const result: QueryResult<ConversationStatusRow[]> = await supabase
    .from('conversation_statuses')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  return result.data ?? [];
}
