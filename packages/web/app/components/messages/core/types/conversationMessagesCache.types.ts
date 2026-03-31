import type { Conversation, Message } from '@/app/types/chat';

/**
 * Cursor structure for pagination (matches API response)
 */
export interface PaginationCursor {
  /** Timestamp of the cursor message */
  timestamp: number;
  /** Key (message ID) of the cursor message */
  key: string;
}

/**
 * Cache data structure for conversation messages stored in IndexedDB
 */
export interface ConversationMessagesCacheData {
  /** Messages keyed by message ID */
  messages: Record<string, Message>;
  /** Timestamp of the newest message in cache */
  newestTimestamp: number;
  /** Timestamp of the oldest message in cache */
  oldestLoadedTimestamp: number;
  /** Whether there are more older messages to load */
  hasMoreOlder: boolean;
  /** Cursor for fetching older messages (contains timestamp and key) */
  oldestCursor: PaginationCursor | null;
  /** ID of the newest message (for delta sync) */
  newestMessageId: string | null;
}

/**
 * Response from paginated messages API
 */
export interface PaginatedMessagesResponse {
  /** Messages keyed by message ID */
  messages: Conversation;
  /** Whether there are more messages available */
  hasMore: boolean;
  /** Cursor for next page (contains timestamp and key) */
  nextCursor?: PaginationCursor;
}

/**
 * Cache state union type for loading states
 */
export type ConversationMessagesCacheState =
  | { status: 'idle' }
  | { status: 'loading-cache' }
  | { status: 'loading-initial' }
  | { status: 'loading-older' }
  | { status: 'loading-newer' }
  | { status: 'ready' }
  | { status: 'error'; error: Error };

/**
 * Empty cache structure for initialization
 */
export const CONVERSATION_MESSAGES_EMPTY_CACHE: ConversationMessagesCacheData = {
  messages: {},
  newestTimestamp: 0,
  oldestLoadedTimestamp: Number.MAX_SAFE_INTEGER,
  hasMoreOlder: true,
  oldestCursor: null,
  newestMessageId: null,
};
