import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { updateConversationLastMessage } from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant, releaseLock, waitForLock } from '../services/redis.js';
import type { ChannelConnectionRow, ConversationRow, IncomingMessage } from '../types/index.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';
import { invokeAgent } from './agentInvoker.js';
import { deliverToProvider } from './messageProcessor.js';

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
  const responseTimestamp = Date.now();
  await saveAiResponse(supabase, conversation.id, responseText, responseTimestamp);

  // Deliver AI response to channel
  const sendResult = await deliverToProvider(supabase, conversation, responseText);

  // Update original_id on the message row if provider returned one
  if (sendResult.originalId !== '') {
    updateSentMessageId(supabase, conversation.id, responseTimestamp, sendResult.originalId);
  }

  // Update conversation with assistant response
  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: responseText,
    lastMessageRole: 'assistant',
    lastMessageType: 'text',
    lastMessageAt: new Date(responseTimestamp).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

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

  await upsertEndUser(supabase, connection.tenant_id, incoming.userChannelId, incoming.userName);
  await saveUserMessage({ supabase, conversationId: conversation.id, incoming });

  // Compute unanswered count
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

  // If AI is disabled, stop here
  if (!conversation.enabled) return;

  await invokeAiWithLock(supabase, conversation, incoming.content, connection.tenant_id);
}

/* ─── Invoke AI with distributed lock for strict turn ordering ─── */

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

/* ─── Process: test message (invoke AI, no channel delivery) ─── */

interface ProcessTestParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

export async function processTestMessage(params: ProcessTestParams): Promise<void> {
  const userChannelId = TEST_USER_CHANNEL_ID;
  const threadId = userChannelId;

  const conversation = await findOrCreateConversation(params.supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId,
    threadId,
    channel: 'api',
  });

  const now = Date.now();
  const incoming: IncomingMessage = {
    userChannelId,
    channelIdentifier: '',
    content: params.content,
    type: params.type,
    originalId: '',
    userName: undefined,
    mediaId: undefined,
    replyOriginalId: undefined,
    timestamp: now,
  };

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

  // Invoke AI (async, don't await for the HTTP response)
  void invokeAiAndSaveTestResponse(params.supabase, conversation, params.content, params.tenantId);
}

/* ─── Invoke AI and save response for test messages ─── */

async function invokeAiAndSaveTestResponse(
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
