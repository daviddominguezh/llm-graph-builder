/**
 * Constants for conversation messages pagination and caching
 */

/** Number of messages to fetch per page */
export const CONVERSATION_MESSAGES_PAGE_SIZE = 50;

/** Scroll threshold for loading older messages (25% from top) */
export const CONVERSATION_MESSAGES_SCROLL_THRESHOLD = 0.25;

/** IndexedDB database name for conversation messages cache */
export const CONVERSATION_MESSAGES_DB_NAME = 'conversationMessagesCacheDB';

/** IndexedDB store name for conversation messages */
export const CONVERSATION_MESSAGES_STORE_NAME = 'conversationMessagesStore';

/** IndexedDB database version */
export const CONVERSATION_MESSAGES_DB_VERSION = 2;
