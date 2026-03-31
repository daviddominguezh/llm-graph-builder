import {
  LAST_MESSAGES_CACHE_DB_NAME,
  LAST_MESSAGES_CACHE_STORE_NAME,
  LAST_MESSAGES_CACHE_VERSION,
  LAST_MESSAGES_EMPTY_CACHE,
} from '@/app/constants/lastMessages';

import type { LastMessage } from '@/app/types/chat';

import type { LastMessagesCacheData } from '../types';

/**
 * IndexedDB-based cache service specifically for lastMessages
 * Handles persistence of conversations with support for pagination and delta sync
 */
class LastMessagesCacheServiceImpl {
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
      const request = indexedDB.open(LAST_MESSAGES_CACHE_DB_NAME, LAST_MESSAGES_CACHE_VERSION);

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

        if (!db.objectStoreNames.contains(LAST_MESSAGES_CACHE_STORE_NAME)) {
          db.createObjectStore(LAST_MESSAGES_CACHE_STORE_NAME, {
            keyPath: 'projectName',
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
   * Get cached data for a project
   */
  async getCache(projectName: string): Promise<LastMessagesCacheData | null> {
    try {
      const db = await this.ensureDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LAST_MESSAGES_CACHE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(LAST_MESSAGES_CACHE_STORE_NAME);
        const request = store.get(projectName);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          resolve(result.data as LastMessagesCacheData);
        };
      });
    } catch (error) {
      console.error('[LastMessagesCacheService] getCache error:', error);
      return null;
    }
  }

  /**
   * Set cache data for a project (full replace)
   */
  async setCache(projectName: string, data: LastMessagesCacheData): Promise<void> {
    try {
      const db = await this.ensureDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LAST_MESSAGES_CACHE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LAST_MESSAGES_CACHE_STORE_NAME);

        const record = {
          projectName,
          data,
          updatedAt: Date.now(),
        };

        const request = store.put(record);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[LastMessagesCacheService] setCache error:', error);
    }
  }

  /**
   * Update a single conversation in the cache
   * Uses highest timestamp wins strategy
   */
  async updateConversation(projectName: string, chatId: string, lastMessage: LastMessage): Promise<void> {
    try {
      const cached = await this.getCache(projectName);
      const data = cached || { ...LAST_MESSAGES_EMPTY_CACHE };

      const existing = data.conversations[chatId];

      // Only update if new message has higher timestamp or doesn't exist
      if (!existing || lastMessage.timestamp > existing.timestamp) {
        data.conversations[chatId] = lastMessage;

        // Update newestTimestamp if this is newer
        if (lastMessage.timestamp > data.newestTimestamp) {
          data.newestTimestamp = lastMessage.timestamp;
        }
      }

      await this.setCache(projectName, data);
    } catch (error) {
      console.error('[LastMessagesCacheService] updateConversation error:', error);
    }
  }

  /**
   * Remove multiple conversations from cache
   */
  async removeConversations(projectName: string, chatIds: string[]): Promise<void> {
    try {
      const cached = await this.getCache(projectName);
      if (!cached) return;

      // Filter out the chat IDs to remove
      const chatIdSet = new Set(chatIds);
      const filteredConversations = Object.fromEntries(
        Object.entries(cached.conversations).filter(([id]) => !chatIdSet.has(id))
      );

      const data: LastMessagesCacheData = {
        ...cached,
        conversations: filteredConversations,
      };

      await this.setCache(projectName, data);
    } catch (error) {
      console.error('[LastMessagesCacheService] removeConversations error:', error);
    }
  }

  /**
   * Merge new conversations into cache
   * Uses highest timestamp wins strategy for conflicts
   */
  async mergeConversations(
    projectName: string,
    newConversations: Record<string, LastMessage>,
    updateMetadata?: {
      newestTimestamp?: number;
      oldestLoadedTimestamp?: number;
      lastDeletedChatsSync?: number;
      hasMore?: boolean;
    }
  ): Promise<LastMessagesCacheData> {
    try {
      const cached = await this.getCache(projectName);
      const data = cached || { ...LAST_MESSAGES_EMPTY_CACHE };

      // Merge conversations with highest timestamp wins
      for (const [id, newMsg] of Object.entries(newConversations)) {
        const existing = data.conversations[id];
        if (!existing || newMsg.timestamp > existing.timestamp) {
          data.conversations[id] = newMsg;
        }
      }

      // Update metadata if provided
      if (updateMetadata) {
        if (
          updateMetadata.newestTimestamp !== undefined &&
          updateMetadata.newestTimestamp > data.newestTimestamp
        ) {
          data.newestTimestamp = updateMetadata.newestTimestamp;
        }
        if (
          updateMetadata.oldestLoadedTimestamp !== undefined &&
          updateMetadata.oldestLoadedTimestamp < data.oldestLoadedTimestamp
        ) {
          data.oldestLoadedTimestamp = updateMetadata.oldestLoadedTimestamp;
        }
        if (updateMetadata.lastDeletedChatsSync !== undefined) {
          data.lastDeletedChatsSync = updateMetadata.lastDeletedChatsSync;
        }
        if (updateMetadata.hasMore !== undefined) {
          data.hasMore = updateMetadata.hasMore;
        }
      }

      // Recalculate newestTimestamp from all conversations
      let maxTimestamp = 0;
      for (const conv of Object.values(data.conversations)) {
        if (conv.timestamp > maxTimestamp) {
          maxTimestamp = conv.timestamp;
        }
      }
      if (maxTimestamp > data.newestTimestamp) {
        data.newestTimestamp = maxTimestamp;
      }

      await this.setCache(projectName, data);
      return data;
    } catch (error) {
      console.error('[LastMessagesCacheService] mergeConversations error:', error);
      return { ...LAST_MESSAGES_EMPTY_CACHE };
    }
  }

  /**
   * Clear cache for a project
   */
  async clearCache(projectName: string): Promise<void> {
    try {
      const db = await this.ensureDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LAST_MESSAGES_CACHE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LAST_MESSAGES_CACHE_STORE_NAME);
        const request = store.delete(projectName);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[LastMessagesCacheService] clearCache error:', error);
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
export const LastMessagesCacheService = new LastMessagesCacheServiceImpl();
