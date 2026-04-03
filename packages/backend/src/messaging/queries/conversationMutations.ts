import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { QueryResult } from './queryHelpers.js';

/* ─── Update last message fields ─── */

interface UpdateLastMessageParams {
  lastMessageContent: string;
  lastMessageRole: string;
  lastMessageType: string;
  lastMessageAt: string;
  lastOriginalId?: string;
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
      last_original_id: params.lastOriginalId ?? null,
      read: params.read,
      unanswered_count: params.unansweredCount,
    })
    .eq('id', conversationId)
    .or(`last_message_at.is.null,last_message_at.lt.${params.lastMessageAt}`);

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

/* ─── Toggle chatbot with nextNode (reset agent session) ─── */

interface AgentSessionRow {
  id: string;
}

async function findAgentSession(
  supabase: SupabaseClient,
  conversation: { agent_id: string; tenant_id: string; user_channel_id: string }
): Promise<AgentSessionRow | null> {
  const result: QueryResult<AgentSessionRow> = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('agent_id', conversation.agent_id)
    .eq('tenant_id', conversation.tenant_id)
    .eq('user_id', conversation.user_channel_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return result.data ?? null;
}

async function resetAgentSessionNode(
  supabase: SupabaseClient,
  sessionId: string,
  nextNode: string
): Promise<void> {
  const result = await supabase
    .from('agent_sessions')
    .update({ current_node_id: nextNode, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (result.error !== null) {
    throw new Error(`resetAgentSessionNode: ${result.error.message}`);
  }
}

interface ConversationLookup {
  agent_id: string;
  tenant_id: string;
  user_channel_id: string;
}

export async function updateConversationChatbot(
  supabase: SupabaseClient,
  conversationId: string,
  enabled: boolean,
  conversation: ConversationLookup,
  nextNode?: string
): Promise<void> {
  await updateConversationEnabled(supabase, conversationId, enabled);

  if (enabled && nextNode !== undefined && nextNode !== '') {
    const session = await findAgentSession(supabase, conversation);
    if (session !== null) {
      await resetAgentSessionNode(supabase, session.id, nextNode);
    }
  }
}

/* ─── Mark read ─── */

export async function markConversationRead(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const result = await supabase.from('conversations').update({ read: true }).eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`markConversationRead: ${result.error.message}`);
  }
}

/* ─── Delete conversation (atomic: tombstone + delete via RPC) ─── */

export async function deleteConversationWithTombstone(
  supabase: SupabaseClient,
  conversationId: string,
  tenantId: string
): Promise<void> {
  const result = await supabase.rpc('delete_conversation_with_tombstone', {
    p_conversation_id: conversationId,
    p_tenant_id: tenantId,
  });

  if (result.error !== null) {
    throw new Error(`deleteConversationWithTombstone: ${result.error.message}`);
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
