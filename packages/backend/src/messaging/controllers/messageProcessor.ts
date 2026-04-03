import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { updateConversationLastMessage } from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { resolveInstagramCredentials } from '../services/instagram/credentials.js';
import { sendInstagramMessage } from '../services/instagram/sender.js';
import { resolveWhatsAppCredentials } from '../services/whatsapp/credentials.js';
import { sendWhatsAppTextMessage } from '../services/whatsapp/sender.js';
import type { ConversationRow, ProviderSendResult } from '../types/index.js';
import { detectChannel, isTestChannel, stripChannelPrefix } from './providerRouter.js';

const ZERO_UNANSWERED = 0;

/* ─── Deliver to channel provider ─── */

async function deliverToWhatsApp(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  content: string
): Promise<ProviderSendResult> {
  const recipient = stripChannelPrefix(conversation.user_channel_id);
  const creds = await resolveWhatsAppCredentials(
    supabase,
    conversation.agent_id,
    conversation.tenant_id
  );
  return sendWhatsAppTextMessage(creds.phoneNumberId, creds.accessToken, recipient, content);
}

async function deliverToInstagram(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  content: string
): Promise<ProviderSendResult> {
  const recipient = stripChannelPrefix(conversation.user_channel_id);
  const creds = await resolveInstagramCredentials(
    supabase,
    conversation.agent_id,
    conversation.tenant_id
  );
  return sendInstagramMessage(creds.igUserId, creds.accessToken, recipient, content);
}

async function deliverToProvider(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  content: string
): Promise<ProviderSendResult> {
  if (isTestChannel(conversation.user_channel_id)) {
    return { originalId: '' };
  }

  const channel = detectChannel(conversation.user_channel_id);

  if (channel === 'whatsapp') {
    return deliverToWhatsApp(supabase, conversation, content);
  }

  if (channel === 'instagram') {
    return deliverToInstagram(supabase, conversation, content);
  }

  return { originalId: '' };
}

/* ─── Save message and AI copy ─── */

interface SaveParams {
  supabase: SupabaseClient;
  conversationId: string;
  type: string;
  content: string;
  originalId: string;
  timestamp: number;
  clientMessageId?: string;
}

async function saveMessagePair(params: SaveParams): Promise<void> {
  await Promise.all([
    insertMessage(params.supabase, {
      id: params.clientMessageId,
      conversationId: params.conversationId,
      role: 'assistant',
      type: params.type,
      content: params.content,
      originalId: params.originalId,
      timestamp: params.timestamp,
    }),
    insertMessageAi(params.supabase, {
      conversationId: params.conversationId,
      role: 'assistant',
      type: params.type,
      content: params.content,
      originalId: params.originalId,
      timestamp: params.timestamp,
    }),
  ]);
}

/* ─── Process: agent sends message from dashboard ─── */

interface ProcessSendParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  userChannelId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

export async function processSendMessage(params: ProcessSendParams): Promise<void> {
  const channel = detectChannel(params.userChannelId);
  const threadId = params.userChannelId;

  const conversation = await findOrCreateConversation(params.supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId: params.userChannelId,
    threadId,
    channel,
  });

  const sendResult = await deliverToProvider(params.supabase, conversation, params.content);
  const now = Date.now();

  await saveMessagePair({
    supabase: params.supabase,
    conversationId: conversation.id,
    type: params.type,
    content: params.content,
    originalId: sendResult.originalId,
    timestamp: now,
    clientMessageId: params.clientMessageId,
  });

  await updateConversationLastMessage(params.supabase, conversation.id, {
    lastMessageContent: params.content,
    lastMessageRole: 'assistant',
    lastMessageType: params.type,
    lastMessageAt: new Date(now).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

  // Redis publish will be wired in Task 26
}
