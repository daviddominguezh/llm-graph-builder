/**
 * Test message processor.
 *
 * Handles messages from the built-in test console (no channel delivery).
 */
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { updateConversationLastMessage } from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant } from '../services/redis.js';
import type { ConversationRow, IncomingMessage } from '../types/index.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';
import { invokeAgent } from './agentInvoker.js';

const ZERO_UNANSWERED = 0;

/* ─── Save message pair ─── */

interface SaveParams {
  supabase: SupabaseClient;
  conversationId: string;
  incoming: IncomingMessage;
  clientMessageId?: string;
}

async function saveUserMessage(params: SaveParams): Promise<void> {
  await Promise.all([
    insertMessage(params.supabase, {
      id: params.clientMessageId,
      conversationId: params.conversationId,
      role: 'user',
      type: params.incoming.type,
      content: params.incoming.content,
      originalId: params.incoming.originalId,
      timestamp: params.incoming.timestamp,
    }),
    insertMessageAi(params.supabase, {
      conversationId: params.conversationId,
      role: 'user',
      type: params.incoming.type,
      content: params.incoming.content,
      originalId: params.incoming.originalId,
      timestamp: params.incoming.timestamp,
    }),
  ]);
}

/* ─── Save AI response ─── */

async function saveAiResponse(
  supabase: SupabaseClient,
  conversationId: string,
  content: string,
  timestamp: number
): Promise<void> {
  await Promise.all([
    insertMessage(supabase, {
      conversationId,
      role: 'assistant',
      type: 'text',
      content,
      timestamp,
    }),
    insertMessageAi(supabase, {
      conversationId,
      role: 'assistant',
      type: 'text',
      content,
      timestamp,
    }),
  ]);
}

/* ─── Publish to Redis ─── */

async function publishUpdate(tenantId: string, conversationId: string): Promise<void> {
  await publishToTenant(tenantId, { conversationId, tenantId }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}

/* ─── Invoke AI and save response ─── */

async function invokeAiAndSave(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userContent: string,
  tenantId: string
): Promise<void> {
  try {
    const aiResult = await invokeAgent({ supabase, conversation, userMessageContent: userContent });
    if (aiResult === null || aiResult.responseText === '') return;

    const responseTimestamp = Date.now();
    await saveAiResponse(supabase, conversation.id, aiResult.responseText, responseTimestamp);

    await updateConversationLastMessage(supabase, conversation.id, {
      lastMessageContent: aiResult.responseText,
      lastMessageRole: 'assistant',
      lastMessageType: 'text',
      lastMessageAt: new Date(responseTimestamp).toISOString(),
      read: true,
      unansweredCount: ZERO_UNANSWERED,
    });

    await publishUpdate(tenantId, conversation.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[messaging] AI invocation for test failed: ${msg}\n`);
  }
}

/* ─── Public API ─── */

interface ProcessTestParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

function buildTestIncoming(content: string, type: string, timestamp: number): IncomingMessage {
  return {
    userChannelId: TEST_USER_CHANNEL_ID,
    channelIdentifier: '',
    content,
    type,
    originalId: '',
    userName: undefined,
    mediaId: undefined,
    replyOriginalId: undefined,
    timestamp,
  };
}

export async function processTestMessage(params: ProcessTestParams): Promise<void> {
  const userChannelId = TEST_USER_CHANNEL_ID;

  const conversation = await findOrCreateConversation(params.supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId,
    threadId: userChannelId,
    channel: 'api',
  });

  const now = Date.now();
  const incoming = buildTestIncoming(params.content, params.type, now);

  await saveUserMessage({
    supabase: params.supabase,
    conversationId: conversation.id,
    incoming,
    clientMessageId: params.clientMessageId,
  });

  await updateConversationLastMessage(params.supabase, conversation.id, {
    lastMessageContent: params.content,
    lastMessageRole: 'user',
    lastMessageType: params.type,
    lastMessageAt: new Date(now).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

  await publishUpdate(params.tenantId, conversation.id);

  void invokeAiAndSave(params.supabase, conversation, params.content, params.tenantId);
}
