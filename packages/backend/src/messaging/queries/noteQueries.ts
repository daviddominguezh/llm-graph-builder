import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ConversationNoteRow } from '../types/index.js';
import type { QueryResult } from './queryHelpers.js';

export async function getNotes(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationNoteRow[]> {
  const result: QueryResult<ConversationNoteRow[]> = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getNotes: ${result.error.message}`);
  }

  return result.data ?? [];
}

export async function createNote(
  supabase: SupabaseClient,
  conversationId: string,
  creatorEmail: string,
  content: string
): Promise<ConversationNoteRow> {
  const result: QueryResult<ConversationNoteRow> = await supabase
    .from('conversation_notes')
    .insert({ conversation_id: conversationId, creator_email: creatorEmail, content })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`createNote: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function deleteNote(
  supabase: SupabaseClient,
  noteId: string,
  conversationId: string
): Promise<void> {
  const result: QueryResult<null> = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', noteId)
    .eq('conversation_id', conversationId);

  if (result.error !== null) {
    throw new Error(`deleteNote: ${result.error.message}`);
  }
}
