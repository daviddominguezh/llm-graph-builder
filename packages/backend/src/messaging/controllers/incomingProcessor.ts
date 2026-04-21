import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { executeAgentCore } from '../../routes/execute/executeCore.js';
import { updateConversationLastMessage } from '../queries/conversationMutations.js';
import { findOrCreateConversation } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant, releaseLock, waitForLock } from '../services/redis.js';
import type { ChannelConnectionRow, ConversationRow, IncomingMessage } from '../types/index.js';
import { REDIS_KEYS, buildRedisKey } from '../types/redisKeys.js';
import { resolveAgentForChannel } from './agentResolver.js';
import { enrichIncomingMessage } from './mediaEnricher.js';
import { deliverToProvider } from './messageProcessor.js';
import { sendTypingIndicator } from './typingIndicators.js';

const INCREMENT = 1;
const SINGLE_RESULT = 1;
const LOCK_TTL_SECONDS = 300;
const LOCK_TIMEOUT_MS = 120_000;

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

/* ─── Save user message to messaging tables ─── */

interface SaveUserParams {
  supabase: SupabaseClient;
  conversationId: string;
  incoming: IncomingMessage;
  mediaUrl?: string;
}

async function saveUserMessage(params: SaveUserParams): Promise<void> {
  await Promise.all([
    insertMessage(params.supabase, {
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

/* ─── Publish conversation update to Redis ─── */

async function publishUpdate(tenantId: string, conversationId: string): Promise<void> {
  await publishToTenant(tenantId, { conversationId, tenantId }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}

/* ─── Update conversation for incoming user message ─── */

async function updateConversationForUser(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  incoming: IncomingMessage,
  tenantId: string
): Promise<void> {
  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: incoming.content,
    lastMessageRole: 'user',
    lastMessageType: incoming.type,
    lastMessageAt: new Date(incoming.timestamp).toISOString(),
    read: false,
    unansweredCount: conversation.unanswered_count + INCREMENT,
  });

  await publishUpdate(tenantId, conversation.id);
}

/* ─── Deliver AI response via channel ─── */

async function deliverAiResponse(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  responseText: string
): Promise<void> {
  await sendTypingIndicator(supabase, conversation);

  const sendResult = await deliverToProvider(supabase, conversation, responseText);
  if (sendResult === null) {
    process.stdout.write(`[messaging] AI send failed for ${conversation.user_channel_id}\n`);
    return;
  }

  if (sendResult.originalId !== '') {
    updateSentMessageId(supabase, conversation.id, sendResult.originalId);
  }
}

/* ─── Update sent message original_id (fire-and-forget) ─── */

function updateSentMessageId(supabase: SupabaseClient, conversationId: string, originalId: string): void {
  const query = supabase
    .from('messages')
    .update({ original_id: originalId })
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('timestamp', { ascending: false })
    .limit(SINGLE_RESULT);

  void Promise.resolve(query).catch((err: unknown) => {
    process.stdout.write(`[messaging] Failed to update sent message ID: ${String(err)}\n`);
  });
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

  const { content: enrichedContent, mediaUrl } = await enrichIncomingMessage(supabase, connection, incoming);
  incoming.content = enrichedContent;

  await upsertEndUser(supabase, connection.tenant_id, incoming.userChannelId, incoming.userName);
  await saveUserMessage({ supabase, conversationId: conversation.id, incoming, mediaUrl });

  await updateConversationForUser(supabase, conversation, incoming, connection.tenant_id);

  if (!conversation.enabled) return;

  await invokeAiWithLock(supabase, conversation, incoming.content, connection);
}

/* ─── Invoke AI with distributed lock ─── */

async function invokeAiWithLock(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userContent: string,
  connection: ChannelConnectionRow
): Promise<void> {
  const lockKey = buildRedisKey(
    REDIS_KEYS.REPLY_LOCK,
    `${connection.tenant_id}:${conversation.user_channel_id}`
  );
  const token = await waitForLock(lockKey, LOCK_TTL_SECONDS, LOCK_TIMEOUT_MS);

  if (token === null) {
    process.stdout.write(`[messaging] Lock timeout for ${lockKey}, skipping AI\n`);
    return;
  }

  try {
    await executeAndDeliver(supabase, conversation, userContent, connection);
  } finally {
    await releaseLock(lockKey, token);
  }
}

/* ─── Execute AI and deliver response ─── */

async function executeAndDeliver(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userContent: string,
  connection: ChannelConnectionRow
): Promise<void> {
  try {
    const agent = await resolveAgentForChannel(supabase, connection);

    const result = await executeAgentCore({
      supabase,
      orgId: agent.orgId,
      agentId: agent.agentId,
      version: agent.version,
      conversationId: conversation.id,
      input: {
        tenantId: connection.tenant_id,
        userId: conversation.user_channel_id,
        sessionId: conversation.thread_id,
        channel: connection.channel_type,
        stream: false,
        message: { text: userContent },
      },
    });

    const responseText = result.output?.text ?? '';
    if (responseText === '') return;

    await deliverAiResponse(supabase, conversation, responseText);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI invocation failed';
    process.stdout.write(`[messaging] AI execution failed: ${errMsg}\n`);
  }
}

// Re-export processTestMessage from its dedicated module
export { processTestMessage } from './testMessageProcessor.js';
