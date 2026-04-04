import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  ConversationAssigneeRow,
  ConversationRow,
  ConversationStatusRow,
  PaginationCursor,
} from '../types/index.js';
import type { QueryResult } from './queryHelpers.js';

const PAGE_SIZE = 20;
const FETCH_EXTRA = 1;
const LAST_INDEX_OFFSET = 1;
const SINGLE_RESULT = 1;
const EMPTY_LENGTH = 0;
const SLICE_START = 0;

/* ─── Find or create ─── */

interface FindOrCreateParams {
  orgId: string;
  agentId: string;
  tenantId: string;
  userChannelId: string;
  threadId: string;
  channel: string;
  name?: string;
}

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  params: FindOrCreateParams
): Promise<ConversationRow> {
  const upserted = await upsertConversation(supabase, params);
  if (upserted !== null) return upserted;

  return await refetchExistingConversation(supabase, params);
}

async function upsertConversation(
  supabase: SupabaseClient,
  params: FindOrCreateParams
): Promise<ConversationRow | null> {
  const result: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .upsert(
      {
        org_id: params.orgId,
        agent_id: params.agentId,
        tenant_id: params.tenantId,
        user_channel_id: params.userChannelId,
        thread_id: params.threadId,
        channel: params.channel,
        name: params.name ?? null,
      },
      { onConflict: 'agent_id,tenant_id,user_channel_id,thread_id', ignoreDuplicates: true }
    )
    .select('*')
    .single();

  return result.data ?? null;
}

async function refetchExistingConversation(
  supabase: SupabaseClient,
  params: FindOrCreateParams
): Promise<ConversationRow> {
  const fetched: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .select('*')
    .eq('agent_id', params.agentId)
    .eq('tenant_id', params.tenantId)
    .eq('user_channel_id', params.userChannelId)
    .eq('thread_id', params.threadId)
    .single();

  if (fetched.error !== null || fetched.data === null) {
    throw new Error(`findOrCreateConversation: ${fetched.error?.message ?? 'No data'}`);
  }

  return fetched.data;
}

/* ─── Inbox pagination (cursor-based) ─── */

interface InboxPageParams {
  tenantId: string;
  cursor?: PaginationCursor;
}

export interface InboxPage {
  conversations: ConversationRow[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
}

function buildInboxCursor(page: ConversationRow[]): PaginationCursor | undefined {
  const { length } = page;
  if (length === EMPTY_LENGTH) return undefined;
  const [lastRow] = page.slice(length - LAST_INDEX_OFFSET);
  if (lastRow === undefined) return undefined;
  return {
    timestamp: new Date(lastRow.last_message_at ?? lastRow.created_at).getTime(),
    key: lastRow.id,
  };
}

export async function getInboxPage(supabase: SupabaseClient, params: InboxPageParams): Promise<InboxPage> {
  let query = supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .order('last_message_at', { ascending: false })
    .limit(PAGE_SIZE + FETCH_EXTRA);

  query = query.not('last_message_at', 'is', null);

  if (params.cursor !== undefined) {
    query = query.or(
      `last_message_at.lt.${new Date(params.cursor.timestamp).toISOString()},` +
        `and(last_message_at.eq.${new Date(params.cursor.timestamp).toISOString()},id.lt.${params.cursor.key})`
    );
  }

  const result: QueryResult<ConversationRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getInboxPage: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(SLICE_START, PAGE_SIZE) : rows;

  return {
    conversations: page,
    hasMore,
    nextCursor: hasMore ? buildInboxCursor(page) : undefined,
  };
}

/* ─── Inbox: all (no pagination) ─── */

export async function getAllInbox(supabase: SupabaseClient, tenantId: string): Promise<ConversationRow[]> {
  const result: QueryResult<ConversationRow[]> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getAllInbox: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Inbox delta (changes since timestamp) ─── */

export async function getInboxDelta(
  supabase: SupabaseClient,
  tenantId: string,
  sinceTimestamp: string
): Promise<ConversationRow[]> {
  const result: QueryResult<ConversationRow[]> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .gt('last_message_at', sinceTimestamp)
    .order('last_message_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getInboxDelta: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Batch fetch assignees by conversation IDs ─── */

function groupByConversationId<T extends { conversation_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const existing = map.get(row.conversation_id) ?? [];
    existing.push(row);
    map.set(row.conversation_id, existing);
  }
  return map;
}

export async function batchGetAssignees(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Map<string, ConversationAssigneeRow[]>> {
  const result: QueryResult<ConversationAssigneeRow[]> = await supabase
    .from('conversation_assignees')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  return groupByConversationId(result.data ?? []);
}

/* ─── Batch fetch statuses by conversation IDs ─── */

export async function batchGetStatuses(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Map<string, ConversationStatusRow[]>> {
  const result: QueryResult<ConversationStatusRow[]> = await supabase
    .from('conversation_statuses')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  return groupByConversationId(result.data ?? []);
}

/* ─── Find conversation by user_channel_id ─── */

export async function findConversationByUserChannelId(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string
): Promise<ConversationRow | null> {
  const result: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_channel_id', userChannelId)
    .order('last_message_at', { ascending: false })
    .limit(SINGLE_RESULT)
    .single();

  return result.data;
}

export { type FindOrCreateParams, type InboxPageParams };
export type { QueryResult } from './queryHelpers.js';
