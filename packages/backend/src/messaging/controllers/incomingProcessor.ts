import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { updateConversationLastMessage } from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant, releaseLock, waitForLock } from '../services/redis.js';
import type { ChannelConnectionRow, ConversationRow, IncomingMessage } from '../types/index.js';
import { invokeAgent } from './agentInvoker.js';
import { enrichIncomingMessage } from './mediaEnricher.js';
import { deliverToProvider } from './messageProcessor.js';
import { sendTypingIndicator } from './typingIndicators.js';

const ZERO_UNANSWERED = 0;
const INCREMENT = 1;
const LOCK_TTL_SECONDS = 300;
const LOCK_TIMEOUT_MS = 120_000; // 2 minutes

/* ─── Upsert end user ─── */

async function upsertEndUser(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string,
  name: string | undefined
): Promise<void> {
  await supabase.from('end_users').upsert(
    {
      tenant_id: tenantId,
      user_channel_id: userChannelId,
      name: name ?? null,
    },
    { onConflict: 'tenant_id,user_channel_id' }
  );
}

/* ─── Save user message ─── */

interface SaveUserParams {
  supabase: SupabaseClient;
  conversationId: string;
  incoming: IncomingMessage;
  mediaUrl?: string;
  clientMessageId?: string;
}

async function saveUserMessage(params: SaveUserParams): Promise<void> {
  await Promise.all([
    insertMessage(params.supabase, {
      id: params.clientMessageId,
      conversationId: params.conversationId,
      role: 'user',
      type: params.incoming.type,
      content: params.incoming.content,
      mediaUrl: params.mediaUrl,
      originalId: params.incoming.originalId,
      timestamp: params.incoming.timestamp,
    }),
    insertMessageAi(params.supabase, {
      conversationId: params.conversationId,
      role: 'user',
      type: params.incoming.type,
      content: params.incoming.content,
      mediaUrl: params.mediaUrl,
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

/* ─── Publish conversation update to Redis ─── */

async function publishUpdate(tenantId: string, conversationId: string): Promise<void> {
  await publishToTenant(tenantId, { conversationId, tenantId }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}

/* ─── Process AI response (deliver + persist) ─── */

async function processAiResponse(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  responseText: string,
  tenantId: string
): Promise<void> {
  // Fix 26: Send typing indicator before delivering AI response
  await sendTypingIndicator(supabase, conversation);

  // Fix 16: Deliver first, only save if successful
  const sendResult = await deliverToProvider(supabase, conversation, responseText);
  if (sendResult === null) {
    process.stdout.write(`[messaging] AI send failed for ${conversation.user_channel_id}\n`);
    return;
  }

  const responseTimestamp = Date.now();
  await saveAiResponse(supabase, conversation.id, responseText, responseTimestamp);

  if (sendResult.originalId !== '') {
    updateSentMessageId(supabase, conversation.id, responseTimestamp, sendResult.originalId);
  }

  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: responseText,
    lastMessageRole: 'assistant',
    lastMessageType: 'text',
    lastMessageAt: new Date(responseTimestamp).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

  // Fix 2: Publish to Redis for real-time inbox
  await publishUpdate(tenantId, conversation.id);
}

/* ─── Update sent message original_id (fire-and-forget) ─── */

function updateSentMessageId(
  supabase: SupabaseClient,
  conversationId: string,
  timestamp: number,
  originalId: string
): void {
  void supabase
    .from('messages')
    .update({ original_id: originalId })
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .eq('timestamp', timestamp);
}

/* ─── Process: incoming webhook message ─── */

interface ProcessIncomingParams {
  supabase: SupabaseClient;
  connection: ChannelConnectionRow;
  incoming: IncomingMessage;
}

export async function processIncomingMessage(params: ProcessIncomingParams): Promise<void> {
  const { supabase, connection, incoming } = params;
  const { userChannelId: threadId } = incoming;

  const conversation = await findOrCreateConversation(supabase, {
    orgId: connection.org_id,
    agentId: connection.agent_id,
    tenantId: connection.tenant_id,
    userChannelId: incoming.userChannelId,
    threadId,
    channel: connection.channel_type,
    name: incoming.userName,
  });

  // R2-1: Download media from provider, R2-2: Audio placeholder
  const enriched = await enrichIncomingMessage(supabase, connection, incoming);
  incoming.content = enriched.content;

  await upsertEndUser(supabase, connection.tenant_id, incoming.userChannelId, incoming.userName);
  await saveUserMessage({
    supabase,
    conversationId: conversation.id,
    incoming,
    mediaUrl: enriched.mediaUrl,
  });

  const newUnansweredCount = conversation.enabled
    ? conversation.unanswered_count
    : conversation.unanswered_count + INCREMENT;

  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: incoming.content,
    lastMessageRole: 'user',
    lastMessageType: incoming.type,
    lastMessageAt: new Date(incoming.timestamp).toISOString(),
    read: false,
    unansweredCount: newUnansweredCount,
  });

  await publishUpdate(connection.tenant_id, conversation.id);

  if (!conversation.enabled) return;

  await invokeAiWithLock(supabase, conversation, incoming.content, connection.tenant_id);
}

/* ─── Invoke AI with distributed lock ─── */

async function invokeAiWithLock(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userContent: string,
  tenantId: string
): Promise<void> {
  const lockKey = `reply:${tenantId}:${conversation.user_channel_id}`;
  const acquired = await waitForLock(lockKey, LOCK_TTL_SECONDS, LOCK_TIMEOUT_MS);

  if (!acquired) {
    process.stdout.write(`[messaging] Lock timeout for ${lockKey}, skipping AI\n`);
    return;
  }

  try {
    const aiResult = await invokeAgent({ supabase, conversation, userMessageContent: userContent });
    if (aiResult === null || aiResult.responseText === '') return;

    await processAiResponse(supabase, conversation, aiResult.responseText, tenantId);
  } finally {
    await releaseLock(lockKey);
  }
}

// Re-export processTestMessage from its dedicated module
export { processTestMessage } from './testMessageProcessor.js';
