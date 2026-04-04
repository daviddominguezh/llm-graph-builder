import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  updateConversationEnabled,
  updateConversationLastMessage,
} from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant } from '../services/redis.js';
import type { ParsedEchoMessage } from '../services/whatsapp/webhookParser.js';
import type { ChannelConnectionRow } from '../types/index.js';

const ZERO_UNANSWERED = 0;

/* ─── Save echo as assistant message ─── */

async function saveEchoMessage(
  supabase: SupabaseClient,
  conversationId: string,
  echo: ParsedEchoMessage
): Promise<void> {
  await Promise.all([
    insertMessage(supabase, {
      conversationId,
      role: 'assistant',
      type: echo.type,
      content: echo.content,
      originalId: echo.originalId,
      timestamp: echo.timestamp,
    }),
    insertMessageAi(supabase, {
      conversationId,
      role: 'assistant',
      type: echo.type,
      content: echo.content,
      originalId: echo.originalId,
      timestamp: echo.timestamp,
    }),
  ]);
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

  await saveEchoMessage(supabase, conversation.id, echo);
  await updateConversationForEcho(supabase, conversation.id, echo);
  await publishToTenant(connection.tenant_id, {
    conversationId: conversation.id,
    tenantId: connection.tenant_id,
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish for echo failed (non-fatal)\n');
  });
}
