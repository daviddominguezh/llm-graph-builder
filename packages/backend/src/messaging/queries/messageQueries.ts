import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { MessageAiRow, MessageRow, PaginationCursor } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const PAGE_SIZE = 50;
const FETCH_EXTRA = 1;
const LAST_INDEX_OFFSET = 1;
const EMPTY_LENGTH = 0;
const SLICE_START = 0;

/* ─── Insert into messages ─── */

interface InsertMessageParams {
  id?: string;
  conversationId: string;
  role: string;
  type: string;
  content: string | null;
  mediaUrl?: string;
  replyId?: string;
  originalId?: string;
  channelThreadId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

function buildMessageInsertData(params: InsertMessageParams): Record<string, unknown> {
  const data: Record<string, unknown> = {
    conversation_id: params.conversationId,
    role: params.role,
    type: params.type,
    content: params.content,
    media_url: params.mediaUrl ?? null,
    reply_id: params.replyId ?? null,
    original_id: params.originalId ?? null,
    channel_thread_id: params.channelThreadId ?? null,
    metadata: params.metadata ?? null,
    timestamp: params.timestamp,
  };

  const { id } = params;
  if (id !== undefined) {
    data.id = id;
  }

  return data;
}

const DUPLICATE_KEY_CODE = '23505';

export async function insertMessage(
  supabase: SupabaseClient,
  params: InsertMessageParams
): Promise<MessageRow | null> {
  const insertData = buildMessageInsertData(params);

  const result: QueryResult<MessageRow> = await supabase
    .from('messages')
    .insert(insertData)
    .select('*')
    .single();

  if (result.error !== null) {
    if (result.error.code === DUPLICATE_KEY_CODE) return null;
    throw new Error(`insertMessage: ${result.error.message}`);
  }

  if (result.data === null) {
    throw new Error('insertMessage: No data');
  }

  return result.data;
}

/* ─── Insert into messages_ai ─── */

interface InsertMessageAiParams {
  conversationId: string;
  role: string;
  type: string;
  content: string | null;
  mediaUrl?: string;
  replyId?: string;
  originalId?: string;
  channelThreadId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  isSummary?: boolean;
}

function buildMessageAiInsertData(params: InsertMessageAiParams): Record<string, unknown> {
  return {
    conversation_id: params.conversationId,
    role: params.role,
    type: params.type,
    content: params.content,
    media_url: params.mediaUrl ?? null,
    reply_id: params.replyId ?? null,
    original_id: params.originalId ?? null,
    channel_thread_id: params.channelThreadId ?? null,
    metadata: params.metadata ?? null,
    timestamp: params.timestamp,
    is_summary: params.isSummary ?? false,
  };
}

export async function insertMessageAi(
  supabase: SupabaseClient,
  params: InsertMessageAiParams
): Promise<MessageAiRow | null> {
  const insertData = buildMessageAiInsertData(params);

  const result: QueryResult<MessageAiRow> = await supabase
    .from('messages_ai')
    .insert(insertData)
    .select('*')
    .single();

  if (result.error !== null) {
    if (result.error.code === DUPLICATE_KEY_CODE) return null;
    throw new Error(`insertMessageAi: ${result.error.message}`);
  }

  if (result.data === null) {
    throw new Error('insertMessageAi: No data');
  }

  return result.data;
}

/* ─── Paginated fetch from messages ─── */

interface MessagePageParams {
  conversationId: string;
  cursor?: PaginationCursor;
}

interface MessagePage {
  messages: MessageRow[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
}

function buildMessageCursor(page: MessageRow[]): PaginationCursor | undefined {
  const { length } = page;
  if (length === EMPTY_LENGTH) return undefined;
  const [lastRow] = page.slice(length - LAST_INDEX_OFFSET);
  if (lastRow === undefined) return undefined;
  return { timestamp: lastRow.timestamp, key: lastRow.id };
}

export async function getMessagePage(
  supabase: SupabaseClient,
  params: MessagePageParams
): Promise<MessagePage> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .order('timestamp', { ascending: false })
    .limit(PAGE_SIZE + FETCH_EXTRA);

  if (params.cursor !== undefined) {
    query = query.lt('timestamp', params.cursor.timestamp);
  }

  const result: QueryResult<MessageRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getMessagePage: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(SLICE_START, PAGE_SIZE) : rows;

  return {
    messages: page.reverse(),
    hasMore,
    nextCursor: hasMore ? buildMessageCursor(page) : undefined,
  };
}

/* ─── All messages (no pagination) ─── */

interface AllMessagesParams {
  conversationId: string;
  fromTimestamp?: number;
}

export async function getAllMessages(
  supabase: SupabaseClient,
  params: AllMessagesParams
): Promise<MessageRow[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .order('timestamp', { ascending: true });

  if (params.fromTimestamp !== undefined) {
    query = query.gt('timestamp', params.fromTimestamp);
  }

  const result: QueryResult<MessageRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getAllMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Hydrate AI messages for edge function ─── */

export async function getAiMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<MessageAiRow[]> {
  const result: QueryResult<MessageAiRow[]> = await supabase
    .from('messages_ai')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });

  if (result.error !== null) {
    throw new Error(`getAiMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}
