/**
 * Typing indicator helpers for WhatsApp and Instagram channels.
 *
 * Sends typing indicators before delivering AI responses.
 * Non-critical: errors are swallowed.
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveInstagramCredentials } from '../services/instagram/credentials.js';
import { sendInstagramTypingIndicator } from '../services/instagram/sender.js';
import { resolveWhatsAppCredentials } from '../services/whatsapp/credentials.js';
import { sendWhatsAppTypingIndicator } from '../services/whatsapp/sender.js';
import type { ConversationRow } from '../types/index.js';
import { detectChannel, stripChannelPrefix } from './providerRouter.js';

async function sendWhatsAppTyping(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  recipient: string
): Promise<void> {
  const creds = await resolveWhatsAppCredentials(supabase, conversation.agent_id, conversation.tenant_id);
  await sendWhatsAppTypingIndicator(
    creds.phoneNumberId,
    creds.accessToken,
    recipient,
    conversation.last_original_id ?? undefined
  );
}

async function sendInstagramTyping(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  recipient: string
): Promise<void> {
  const creds = await resolveInstagramCredentials(supabase, conversation.agent_id, conversation.tenant_id);
  await sendInstagramTypingIndicator(creds.igUserId, creds.accessToken, recipient);
}

export async function sendTypingIndicator(
  supabase: SupabaseClient,
  conversation: ConversationRow
): Promise<void> {
  const channel = detectChannel(conversation.user_channel_id);
  const recipient = stripChannelPrefix(conversation.user_channel_id);

  try {
    if (channel === 'whatsapp') {
      await sendWhatsAppTyping(supabase, conversation, recipient);
    }

    if (channel === 'instagram') {
      await sendInstagramTyping(supabase, conversation, recipient);
    }
  } catch {
    // Typing indicators are non-critical
  }
}
