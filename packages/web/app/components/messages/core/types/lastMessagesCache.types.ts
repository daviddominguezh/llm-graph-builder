import type { LastMessage } from '@/app/types/chat';

/**
 * Cache data structure stored in IndexedDB
 */
export interface LastMessagesCacheData {
  /** All cached conversations keyed by chatId */
  conversations: Record<string, LastMessage>;
  /** Highest timestamp in cache - used for delta sync */
  newestTimestamp: number;
  /** Lowest timestamp loaded - used to track pagination progress */
  oldestLoadedTimestamp: number;
  /** Last time we synced deleted chats - used for deletedChats endpoint */
  lastDeletedChatsSync: number;
  /** Whether there are more pages to load */
  hasMore: boolean;
  /** Cursor for next page (cursor-based pagination) */
  nextCursor?: PaginationCursor | null;
}

/**
 * Cursor for pagination
 */
export interface PaginationCursor {
  timestamp: number;
  key: string;
}

/**
 * Response from paginated lastMessages endpoint
 * GET /messages/last?paginate=true
 */
export interface PaginatedLastMessagesResponse {
  /** Conversations for this page */
  messages: Record<string, LastMessage>;
  /** Whether there are more pages */
  hasMore: boolean;
  /** Cursor for next page (undefined when no more pages) */
  nextCursor?: PaginationCursor;
}

/**
 * Response from delta lastMessages endpoint
 * GET /messages/last?timestamp=X
 */
export interface DeltaLastMessagesResponse {
  /** Conversations updated since timestamp */
  conversations: Record<string, LastMessage>;
}

/**
 * Response from deleted chats endpoint
 * GET /messages/deletedChats?from=X
 */
export interface DeletedChatsResponse {
  /** IDs of deleted chats */
  deletedChats: string[];
}

/**
 * State of the cache loading process
 */
export type LastMessagesCacheState =
  | { status: 'idle' }
  | { status: 'loading-cache' }
  | { status: 'loading-delta' }
  | { status: 'loading-page'; page: number }
  | { status: 'ready' }
  | { status: 'error'; error: Error };

/**
 * Metadata for cache versioning and tracking
 */
export interface LastMessagesCacheMetadata {
  /** Schema version for migrations */
  version: number;
  /** Last time cache was updated */
  lastUpdated: number;
  /** Project this cache belongs to */
  projectName: string;
}
