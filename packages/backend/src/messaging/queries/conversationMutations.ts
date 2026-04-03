import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ─── Update last message fields ─── */

interface UpdateLastMessageParams {
  lastMessageContent: string;
  lastMessageRole: string;
  lastMessageType: string;
  lastMessageAt: string;
  read: boolean;
  unansweredCount: number;
}

export async function updateConversationLastMessage(
  supabase: SupabaseClient,
  conversationId: string,
  params: UpdateLastMessageParams
): Promise<void> {
  const result = await supabase
    .from('conversations')
    .update({
      last_message_content: params.lastMessageContent,
      last_message_role: params.lastMessageRole,
      last_message_type: params.lastMessageType,
      last_message_at: params.lastMessageAt,
      read: params.read,
      unanswered_count: params.unansweredCount,
    })
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`updateConversationLastMessage: ${result.error.message}`);
  }
}

/* ─── Toggle chatbot ─── */

export async function updateConversationEnabled(
  supabase: SupabaseClient,
  conversationId: string,
  enabled: boolean
): Promise<void> {
  const result = await supabase.from('conversations').update({ enabled }).eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`updateConversationEnabled: ${result.error.message}`);
  }
}

/* ─── Mark read ─── */

export async function markConversationRead(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const result = await supabase.from('conversations').update({ read: true }).eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`markConversationRead: ${result.error.message}`);
  }
}

/* ─── Delete conversation ─── */

export async function deleteConversation(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const result = await supabase.from('conversations').delete().eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`deleteConversation: ${result.error.message}`);
  }
}

/* ─── Insert deleted conversation record ─── */

export async function insertDeletedConversation(
  supabase: SupabaseClient,
  conversationId: string,
  tenantId: string
): Promise<void> {
  const result = await supabase
    .from('deleted_conversations')
    .insert({ conversation_id: conversationId, tenant_id: tenantId });

  if (result.error !== null) {
    throw new Error(`insertDeletedConversation: ${result.error.message}`);
  }
}

/* ─── Get deleted conversations since timestamp ─── */

interface DeletedConversationResult {
  conversation_id: string;
}

export async function getDeletedConversations(
  supabase: SupabaseClient,
  tenantId: string,
  since: string
): Promise<string[]> {
  const result: {
    data: DeletedConversationResult[] | null;
    error: { message: string } | null;
  } = await supabase
    .from('deleted_conversations')
    .select('conversation_id')
    .eq('tenant_id', tenantId)
    .gte('deleted_at', since);

  if (result.error !== null) {
    throw new Error(`getDeletedConversations: ${result.error.message}`);
  }

  return (result.data ?? []).map((r) => r.conversation_id);
}
