/**
 * Constants for lastMessages pagination and caching
 */
import type { LastMessagesCacheData } from '@/app/components/messages/core/types';

/** Number of conversations returned per page */
export const LAST_MESSAGES_PAGE_SIZE = 50;

/** Scroll threshold (0-1) to trigger loading more conversations */
export const LAST_MESSAGES_SCROLL_THRESHOLD = 0.5;

/** IndexedDB database name for lastMessages cache */
export const LAST_MESSAGES_CACHE_DB_NAME = 'lastMessagesCacheDB';

/** IndexedDB object store name */
export const LAST_MESSAGES_CACHE_STORE_NAME = 'lastMessagesStore';

/** IndexedDB schema version */
export const LAST_MESSAGES_CACHE_VERSION = 2;

/** Default empty cache data */
export const LAST_MESSAGES_EMPTY_CACHE: LastMessagesCacheData = {
  conversations: {},
  newestTimestamp: 0,
  oldestLoadedTimestamp: Number.MAX_SAFE_INTEGER,
  lastDeletedChatsSync: 0,
  hasMore: true,
  nextCursor: null,
};
