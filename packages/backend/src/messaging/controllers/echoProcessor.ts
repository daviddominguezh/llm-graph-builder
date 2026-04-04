import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { decryptWhatsAppToken, getWhatsAppCredential } from '../queries/channelQueries.js';
import {
  updateConversationEnabled,
  updateConversationLastMessage,
} from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { downloadWhatsAppMedia } from '../services/mediaDownloader.js';
import { publishToTenant } from '../services/redis.js';
import type { ParsedEchoMessage } from '../services/whatsapp/webhookParser.js';
import type { ChannelConnectionRow } from '../types/index.js';

const ZERO_UNANSWERED = 0;

/* ─── Media download for echo messages ─── */

async function downloadEchoMedia(
  supabase: SupabaseClient,
  connection: ChannelConnectionRow,
  echo: ParsedEchoMessage,
  conversationId: string
): Promise<string | undefined> {
  if (echo.mediaId === undefined) return undefined;

  const credential = await getWhatsAppCredential(supabase, connection.id);
  if (credential === null) {
    process.stdout.write('[echo] No WA credential found for media download\n');
    return undefined;
  }

  const accessToken = await decryptWhatsAppToken(supabase, credential.id);
  const prefix = `echo/${conversationId}`;
  return await downloadWhatsAppMedia(supabase, echo.mediaId, accessToken, prefix);
}

/* ─── Save echo as assistant message ─── */

interface SaveEchoParams {
  supabase: SupabaseClient;
  conversationId: string;
  echo: ParsedEchoMessage;
  mediaUrl: string | undefined;
}

async function saveEchoMessage(params: SaveEchoParams): Promise<void> {
  const { supabase, conversationId, echo, mediaUrl } = params;
  const messageData = {
    conversationId,
    role: 'assistant' as const,
    type: echo.type,
    content: echo.content,
    originalId: echo.originalId,
    timestamp: echo.timestamp,
    mediaUrl,
  };

  await Promise.all([insertMessage(supabase, messageData), insertMessageAi(supabase, messageData)]);
}

/* ─── Update conversation state for echo ─── */

async function updateConversationForEcho(
  supabase: SupabaseClient,
  conversationId: string,
  echo: ParsedEchoMessage
): Promise<void> {
  await updateConversationLastMessage(supabase, conversationId, {
    lastMessageContent: echo.content,
    lastMessageRole: 'assistant',
    lastMessageType: echo.type,
    lastMessageAt: new Date(echo.timestamp).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });
  await updateConversationEnabled(supabase, conversationId, false);
}

/* ─── Process a single echo message ─── */

interface ProcessEchoParams {
  supabase: SupabaseClient;
  connection: ChannelConnectionRow;
  echo: ParsedEchoMessage;
}

export async function processEchoMessage(params: ProcessEchoParams): Promise<void> {
  const { supabase, connection, echo } = params;
  const { userChannelId: threadId } = echo;

  const conversation = await findOrCreateConversation(supabase, {
    orgId: connection.org_id,
    agentId: connection.agent_id,
    tenantId: connection.tenant_id,
    userChannelId: echo.userChannelId,
    threadId,
    channel: connection.channel_type,
  });

  const mediaUrl = await downloadEchoMedia(supabase, connection, echo, conversation.id).catch(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      process.stdout.write(`[echo] Media download failed (non-fatal): ${msg}\n`);
      return undefined;
    }
  );

  await saveEchoMessage({ supabase, conversationId: conversation.id, echo, mediaUrl });
  await updateConversationForEcho(supabase, conversation.id, echo);
  await publishToTenant(connection.tenant_id, {
    conversationId: conversation.id,
    tenantId: connection.tenant_id,
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish for echo failed (non-fatal)\n');
  });
}
