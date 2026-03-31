import {
  CONVERSATION_MESSAGES_DB_NAME,
  CONVERSATION_MESSAGES_DB_VERSION,
  CONVERSATION_MESSAGES_STORE_NAME,
} from '@/app/constants/conversationMessages';
import type { Message } from '@/app/types/chat';

import type {
  ConversationMessagesCacheData,
  PaginationCursor,
} from '../types/conversationMessagesCache.types';
import { CONVERSATION_MESSAGES_EMPTY_CACHE } from '../types/conversationMessagesCache.types';

/**
 * Generate cache key for a specific conversation
 */
const getCacheKey = (projectName: string, chatId: string): string => `${projectName}:${chatId}`;

/**
 * IndexedDB-based cache service for conversation messages
 * Handles persistence of messages with support for pagination
 */
class ConversationMessagesCacheServiceImpl {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  private async initDatabase(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CONVERSATION_MESSAGES_DB_NAME, CONVERSATION_MESSAGES_DB_VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(CONVERSATION_MESSAGES_STORE_NAME)) {
          db.createObjectStore(CONVERSATION_MESSAGES_STORE_NAME, {
            keyPath: 'cacheKey',
          });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureDatabase(): Promise<IDBDatabase> {
    await this.initDatabase();
    if (!this.db) {
      throw new Error('IndexedDB not available');
    }
    return this.db;
  }

  /**
   * Get cached messages for a specific conversation
   */
  async getCache(projectName: string, chatId: string): Promise<ConversationMessagesCacheData | null> {
    try {
      const db = await this.ensureDatabase();
      const cacheKey = getCacheKey(projectName, chatId);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_MESSAGES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME);
        const request = store.get(cacheKey);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          resolve(result.data as ConversationMessagesCacheData);
        };
      });
    } catch (error) {
      console.error('[ConversationMessagesCacheService] getCache error:', error);
      return null;
    }
  }

  /**
   * Set cache data for a conversation (full replace)
   */
  async setCache(projectName: string, chatId: string, data: ConversationMessagesCacheData): Promise<void> {
    try {
      const db = await this.ensureDatabase();
      const cacheKey = getCacheKey(projectName, chatId);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME);

        const record = {
          cacheKey,
          projectName,
          chatId,
          data,
          updatedAt: Date.now(),
        };

        const request = store.put(record);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[ConversationMessagesCacheService] setCache error:', error);
    }
  }

  /**
   * Prepend older messages to cache (for scroll-up pagination)
   */
  async prependMessages(
    projectName: string,
    chatId: string,
    messages: Record<string, Message>,
    hasMoreOlder: boolean,
    oldestCursor: PaginationCursor | null
  ): Promise<ConversationMessagesCacheData> {
    try {
      const cached = await this.getCache(projectName, chatId);
      const data = cached || { ...CONVERSATION_MESSAGES_EMPTY_CACHE };

      // Merge new older messages with existing
      for (const [id, msg] of Object.entries(messages)) {
        if (!data.messages[id]) {
          data.messages[id] = msg;
        }
      }

      // Update metadata
      data.hasMoreOlder = hasMoreOlder;
      data.oldestCursor = oldestCursor;

      // Recalculate oldest timestamp
      let minTimestamp = Number.MAX_SAFE_INTEGER;
      for (const msg of Object.values(data.messages)) {
        if (msg.timestamp < minTimestamp) {
          minTimestamp = msg.timestamp;
        }
      }
      data.oldestLoadedTimestamp = minTimestamp;

      await this.setCache(projectName, chatId, data);
      return data;
    } catch (error) {
      console.error('[ConversationMessagesCacheService] prependMessages error:', error);
      return { ...CONVERSATION_MESSAGES_EMPTY_CACHE };
    }
  }

  /**
   * Append newer messages to cache (for real-time updates)
   */
  async appendMessages(
    projectName: string,
    chatId: string,
    messages: Record<string, Message>
  ): Promise<ConversationMessagesCacheData> {
    try {
      const cached = await this.getCache(projectName, chatId);
      const data = cached || { ...CONVERSATION_MESSAGES_EMPTY_CACHE };

      // Merge new messages with existing
      for (const [id, msg] of Object.entries(messages)) {
        // Always update if message is newer or doesn't exist
        const existing = data.messages[id];
        if (!existing || msg.timestamp >= existing.timestamp) {
          data.messages[id] = msg;
        }
      }

      // Recalculate newest timestamp and newest message ID
      let maxTimestamp = 0;
      let newestId: string | null = null;
      for (const [id, msg] of Object.entries(data.messages)) {
        if (msg.timestamp > maxTimestamp) {
          maxTimestamp = msg.timestamp;
          newestId = id;
        }
      }
      data.newestTimestamp = maxTimestamp;
      data.newestMessageId = newestId;

      await this.setCache(projectName, chatId, data);
      return data;
    } catch (error) {
      console.error('[ConversationMessagesCacheService] appendMessages error:', error);
      return { ...CONVERSATION_MESSAGES_EMPTY_CACHE };
    }
  }

  /**
   * Update a single message in cache
   */
  async updateMessage(
    projectName: string,
    chatId: string,
    messageId: string,
    update: Partial<Message>
  ): Promise<void> {
    try {
      const cached = await this.getCache(projectName, chatId);
      if (!cached) return;

      const existing = cached.messages[messageId];
      if (!existing) return;

      cached.messages[messageId] = { ...existing, ...update };
      await this.setCache(projectName, chatId, cached);
    } catch (error) {
      console.error('[ConversationMessagesCacheService] updateMessage error:', error);
    }
  }

  /**
   * Clear cache for a specific conversation
   */
  async clearConversationCache(projectName: string, chatId: string): Promise<void> {
    try {
      const db = await this.ensureDatabase();
      const cacheKey = getCacheKey(projectName, chatId);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME);
        const request = store.delete(cacheKey);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[ConversationMessagesCacheService] clearConversationCache error:', error);
    }
  }

  /**
   * Clear all conversation caches for a project
   */
  async clearProjectCache(projectName: string): Promise<void> {
    try {
      const db = await this.ensureDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATION_MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME);
        const request = store.openCursor();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const record = cursor.value;
            if (record.projectName === projectName) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    } catch (error) {
      console.error('[ConversationMessagesCacheService] clearProjectCache error:', error);
    }
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }
}

// Singleton instance
export const ConversationMessagesCacheService = new ConversationMessagesCacheServiceImpl();
