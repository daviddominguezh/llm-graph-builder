import { ConversationMessagesCacheService } from '@/app/components/messages/core/services/ConversationMessagesCacheService';
import { LastMessagesCacheService } from '@/app/components/messages/core/services/LastMessagesCacheService';
import type { LastMessagesCacheData, LastMessagesCacheState } from '@/app/components/messages/core/types';
import {
  getDeletedChats,
  getLastMessagesDelta,
  getLastMessagesPaginated,
} from '@/app/components/messages/services/api';
import { getLastMessagesFromStore } from '@/app/components/messages/store';
import { LAST_MESSAGES_EMPTY_CACHE } from '@/app/constants/lastMessages';
import { TEST_PHONE } from '@/app/constants/messages';
import type { LastMessage } from '@/app/types/chat';
import { INTENT } from '@/app/types/chat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

interface UseLastMessagesWithCacheReturn {
  /** Sorted array of conversations (newest first) */
  conversations: LastMessage[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more pages is in progress */
  isLoadingMore: boolean;
  /** Whether there are more pages to load */
  hasMore: boolean;
  /** Current error, if any */
  error: Error | null;
  /** Load more conversations (pagination) */
  loadMore: () => Promise<void>;
  /** Refresh all data (delta sync) */
  refresh: () => Promise<void>;
  /** Update a single conversation (e.g., from socket) */
  updateConversation: (chatId: string, lastMessage: LastMessage) => Promise<void>;
  /** Remove conversations (e.g., deleted chats) */
  removeConversations: (chatIds: string[]) => Promise<void>;
  /** Current cache state */
  cacheState: LastMessagesCacheState;
}

/**
 * Hook to manage lastMessages with IndexedDB caching, delta sync, and pagination
 *
 * Flow:
 * 1. On mount: Load from IndexedDB → show cached data immediately
 * 2. Fetch delta (or page=0 if no cache)
 * 3. Fetch deleted chats (skip on first load)
 * 4. Merge with highest timestamp wins strategy
 * 5. On scroll: Load more pages
 */
export const useLastMessagesWithCache = (projectName: string): UseLastMessagesWithCacheReturn => {
  const [cacheData, setCacheData] = useState<LastMessagesCacheData | null>(null);
  const [cacheState, setCacheState] = useState<LastMessagesCacheState>({ status: 'idle' });
  const [error, setError] = useState<Error | null>(null);

  // Ref to track if this is the first load (no cache)
  const isFirstLoadRef = useRef(true);
  // Ref to prevent duplicate loads
  const loadingRef = useRef(false);
  // Ref to track message IDs we've already synced from Redux
  // This helps distinguish between "new message with same timestamp" and "Redux reset to old message"
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());

  /**
   * Merge incoming conversations with existing cache data
   * Uses highest timestamp wins strategy
   */
  const mergeConversations = useCallback(
    (
      existing: Record<string, LastMessage>,
      incoming: Record<string, LastMessage> | null | undefined
    ): Record<string, LastMessage> => {
      const result = { ...existing };

      // Handle null/undefined incoming
      if (!incoming) {
        return result;
      }

      for (const [id, newMsg] of Object.entries(incoming)) {
        const existingMsg = result[id];
        if (!existingMsg || newMsg.timestamp > existingMsg.timestamp) {
          result[id] = newMsg;
        }
      }

      return result;
    },
    []
  );

  /**
   * Calculate metadata from conversations
   */
  const calculateMetadata = useCallback((conversations: Record<string, LastMessage> | null | undefined) => {
    let newestTimestamp = 0;
    let oldestTimestamp = Number.MAX_SAFE_INTEGER;

    // Handle null/undefined conversations
    if (!conversations) {
      return { newestTimestamp, oldestTimestamp };
    }

    for (const conv of Object.values(conversations)) {
      if (conv.timestamp > newestTimestamp) {
        newestTimestamp = conv.timestamp;
      }
      if (conv.timestamp < oldestTimestamp) {
        oldestTimestamp = conv.timestamp;
      }
    }

    return { newestTimestamp, oldestTimestamp };
  }, []);

  /**
   * Create an empty test chat entry for UI display
   * Used when test chat doesn't exist in cached/fetched data
   */
  const createEmptyTestChat = useCallback(
    (): LastMessage => ({
      id: `test-${Date.now()}`,
      timestamp: Date.now(),
      key: TEST_PHONE,
      originalId: '',
      intent: INTENT.NONE,
      message: { role: 'assistant', content: '' },
      type: 'text',
      read: true,
      enabled: true,
      name: 'Test Chat',
      isTestChat: true,
    }),
    []
  );

  /**
   * Initial load: Read from IndexedDB then sync with server
   */
  const initialLoad = useCallback(async () => {
    if (loadingRef.current || !projectName) return;
    loadingRef.current = true;

    try {
      // 1. Load from IndexedDB
      setCacheState({ status: 'loading-cache' });
      const cached = await LastMessagesCacheService.getCache(projectName);

      if (cached && cached.conversations && Object.keys(cached.conversations).length > 0) {
        // Cache exists - show immediately and do delta sync
        isFirstLoadRef.current = false;
        setCacheData(cached);

        // Populate synced message IDs with existing cache IDs
        // This prevents re-syncing messages we already have when Redux "resets"
        for (const conv of Object.values(cached.conversations ?? {})) {
          syncedMessageIdsRef.current.add(conv.id);
        }
        setCacheState({ status: 'loading-delta' });

        // 2. Delta sync: Get new/updated conversations since last sync
        const deltaResponse = await getLastMessagesDelta(projectName, cached.newestTimestamp);

        if (deltaResponse) {
          const mergedConversations = mergeConversations(cached.conversations, deltaResponse.conversations);

          const metadata = calculateMetadata(mergedConversations);

          const newCacheData: LastMessagesCacheData = {
            ...cached,
            conversations: mergedConversations,
            newestTimestamp: metadata.newestTimestamp,
          };

          // 3. Fetch deleted chats (only if we have cache)
          const deletedResponse = await getDeletedChats(projectName, cached.lastDeletedChatsSync);

          if (deletedResponse && deletedResponse.deletedChats.length > 0) {
            const deletedSet = new Set(deletedResponse.deletedChats);

            // Remove deleted chats from cache (including test chat if deleted)
            newCacheData.conversations = Object.fromEntries(
              Object.entries(newCacheData.conversations).filter(([id]) => !deletedSet.has(id))
            );

            // Clear IndexedDB cache for conversation messages of deleted chats
            for (const chatId of deletedResponse.deletedChats) {
              ConversationMessagesCacheService.clearConversationCache(projectName, chatId).catch((err) => {
                console.error('[useLastMessagesWithCache] Failed to clear conversation cache:', chatId, err);
              });
            }

            // Update sync timestamp to current time
            newCacheData.lastDeletedChatsSync = Date.now();
          }

          // 4. Update state and persist
          setCacheData(newCacheData);
          await LastMessagesCacheService.setCache(projectName, newCacheData);
        }
      } else {
        // No cache - fetch first page
        isFirstLoadRef.current = true;
        setCacheState({ status: 'loading-page', page: 0 });

        const paginatedResponse = await getLastMessagesPaginated(projectName);

        if (paginatedResponse) {
          const metadata = calculateMetadata(paginatedResponse.messages);

          const newCacheData: LastMessagesCacheData = {
            conversations: paginatedResponse.messages,
            newestTimestamp: metadata.newestTimestamp,
            oldestLoadedTimestamp: metadata.oldestTimestamp,
            lastDeletedChatsSync: Date.now(),
            hasMore: paginatedResponse.hasMore,
            nextCursor: paginatedResponse.nextCursor ?? null,
          };

          setCacheData(newCacheData);
          await LastMessagesCacheService.setCache(projectName, newCacheData);

          // Populate synced message IDs with fetched message IDs
          for (const conv of Object.values(paginatedResponse.messages ?? {})) {
            syncedMessageIdsRef.current.add(conv.id);
          }
        } else {
          // No data available
          setCacheData({ ...LAST_MESSAGES_EMPTY_CACHE });
        }
      }

      setCacheState({ status: 'ready' });
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load conversations');
      setError(error);
      setCacheState({ status: 'error', error });
      console.error('[useLastMessagesWithCache] initialLoad error:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [projectName, mergeConversations, calculateMetadata]);

  /**
   * Load more pages (infinite scroll) using cursor-based pagination
   */
  const loadMore = useCallback(async () => {
    if (
      loadingRef.current ||
      !projectName ||
      !cacheData?.hasMore ||
      !cacheData?.nextCursor ||
      cacheState.status !== 'ready'
    ) {
      return;
    }

    loadingRef.current = true;

    try {
      setCacheState({ status: 'loading-page', page: 1 }); // page number is just for UI indication

      const response = await getLastMessagesPaginated(projectName, cacheData.nextCursor);

      if (response) {
        const mergedConversations = mergeConversations(cacheData.conversations, response.messages);

        const metadata = calculateMetadata(response.messages);

        const newCacheData: LastMessagesCacheData = {
          ...cacheData,
          conversations: mergedConversations,
          oldestLoadedTimestamp: Math.min(cacheData.oldestLoadedTimestamp, metadata.oldestTimestamp),
          hasMore: response.hasMore,
          nextCursor: response.nextCursor ?? null,
        };

        setCacheData(newCacheData);
        await LastMessagesCacheService.setCache(projectName, newCacheData);
      }

      setCacheState({ status: 'ready' });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load more conversations');
      setError(error);
      setCacheState({ status: 'error', error });
      console.error('[useLastMessagesWithCache] loadMore error:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [projectName, cacheData, cacheState.status, mergeConversations, calculateMetadata]);

  /**
   * Refresh data (delta sync)
   */
  const refresh = useCallback(async () => {
    if (loadingRef.current || !projectName || !cacheData) return;
    loadingRef.current = true;

    try {
      setCacheState({ status: 'loading-delta' });

      const deltaResponse = await getLastMessagesDelta(projectName, cacheData.newestTimestamp);

      if (deltaResponse) {
        const mergedConversations = mergeConversations(cacheData.conversations, deltaResponse.conversations);

        const metadata = calculateMetadata(mergedConversations);

        const newCacheData: LastMessagesCacheData = {
          ...cacheData,
          conversations: mergedConversations,
          newestTimestamp: metadata.newestTimestamp,
        };

        setCacheData(newCacheData);
        await LastMessagesCacheService.setCache(projectName, newCacheData);
      }

      setCacheState({ status: 'ready' });
    } catch (err) {
      console.error('[useLastMessagesWithCache] refresh error:', err);
      setCacheState({ status: 'ready' }); // Don't show error on refresh failure
    } finally {
      loadingRef.current = false;
    }
  }, [projectName, cacheData, mergeConversations, calculateMetadata]);

  /**
   * Update a single conversation (e.g., from socket event)
   */
  const updateConversation = useCallback(
    async (chatId: string, lastMessage: LastMessage) => {
      if (!projectName) return;

      // Update IndexedDB
      await LastMessagesCacheService.updateConversation(projectName, chatId, lastMessage);

      // Update local state
      setCacheData((prev) => {
        if (!prev) return prev;

        const existing = prev.conversations[chatId];

        // Don't update if existing is newer, but allow update if same timestamp with different ID
        // (handles rapid messages with same timestamp)
        if (existing && lastMessage.timestamp < existing.timestamp) {
          return prev; // Don't update if existing is strictly newer
        }
        if (lastMessage.timestamp === existing?.timestamp && lastMessage.id === existing.id) {
          return prev; // Same message, no update needed
        }

        const newConversations = {
          ...prev.conversations,
          [chatId]: lastMessage,
        };

        const newNewestTimestamp = Math.max(prev.newestTimestamp, lastMessage.timestamp);

        return {
          ...prev,
          conversations: newConversations,
          newestTimestamp: newNewestTimestamp,
        };
      });
    },
    [projectName]
  );

  /**
   * Remove conversations from cache
   */
  const removeConversations = useCallback(
    async (chatIds: string[]) => {
      if (!projectName || chatIds.length === 0) return;

      // Update IndexedDB
      await LastMessagesCacheService.removeConversations(projectName, chatIds);

      // Update local state
      setCacheData((prev) => {
        if (!prev) return prev;

        const chatIdSet = new Set(chatIds);
        const newConversations = Object.fromEntries(
          Object.entries(prev.conversations).filter(([id]) => !chatIdSet.has(id))
        );

        return {
          ...prev,
          conversations: newConversations,
        };
      });
    },
    [projectName]
  );

  // Get Redux lastMessages for sync (socket updates go to Redux first)
  const reduxLastMessages = useSelector(getLastMessagesFromStore);

  /**
   * Sync from Redux when it has newer data.
   * We read cacheData via ref to avoid the dependency cycle:
   * effect sets cacheData → cacheData changes → effect re-fires.
   */
  const cacheDataRef = useRef(cacheData);
  useEffect(() => {
    cacheDataRef.current = cacheData;
  }, [cacheData]);

  useEffect(() => {
    const currentCache = cacheDataRef.current;
    if (!reduxLastMessages || !currentCache?.conversations) return;

    let hasUpdates = false;
    const updates: Record<string, LastMessage> = {};

    for (const [chatId, reduxMsg] of Object.entries(reduxLastMessages)) {
      const cachedMsg = currentCache.conversations[chatId];

      const isNewChat = !cachedMsg;
      const isNewerTimestamp = cachedMsg && reduxMsg.timestamp > cachedMsg.timestamp;

      const isSameTimestampNewMessage =
        reduxMsg.timestamp === cachedMsg?.timestamp &&
        reduxMsg.id !== cachedMsg.id &&
        !syncedMessageIdsRef.current.has(reduxMsg.id);

      if (isNewChat || isNewerTimestamp || isSameTimestampNewMessage) {
        hasUpdates = true;
        updates[chatId] = reduxMsg;
        syncedMessageIdsRef.current.add(reduxMsg.id);
      }
    }

    if (hasUpdates) {
      setCacheData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conversations: {
            ...prev.conversations,
            ...updates,
          },
          newestTimestamp: Math.max(prev.newestTimestamp, ...Object.values(updates).map((u) => u.timestamp)),
        };
      });

      for (const [chatId, msg] of Object.entries(updates)) {
        LastMessagesCacheService.updateConversation(projectName, chatId, msg).catch((err) => {
          console.error('[useLastMessagesWithCache] Failed to persist Redux sync to IndexedDB:', err);
        });
      }
    }
  }, [reduxLastMessages, projectName]);

  /**
   * Initial load on mount
   * Uses mounted ref to handle React StrictMode double-mount
   */
  useEffect(() => {
    let isMounted = true;

    const doInitialLoad = async () => {
      if (!projectName) return;

      // Wait a tick to coalesce StrictMode double-mounts
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (!isMounted) {
        return;
      }

      await initialLoad();
    };

    doInitialLoad();

    return () => {
      isMounted = false;
    };
  }, [projectName, initialLoad]);

  /**
   * Convert conversations object to sorted array (newest first)
   * Ensures key field is set from the object key for each conversation
   * UI GUARANTEE: Test chat is always included - if not in data, add empty one
   */
  const conversations = useMemo(() => {
    // Helper to create empty test chat with guaranteed key field
    const emptyTestChat = { ...createEmptyTestChat(), key: TEST_PHONE };

    if (!cacheData?.conversations) {
      // No data yet - return just the empty test chat for UI
      return [emptyTestChat];
    }

    const entries = Object.entries(cacheData.conversations ?? {});
    const hasTestChat = entries.some(([k]) => k === TEST_PHONE);

    const mapped = entries.map(([chatId, conv]) => ({
      ...conv,
      key: chatId, // Ensure key is set from the object key
    }));

    // UI GUARANTEE: If test chat doesn't exist in data, add empty one
    if (!hasTestChat) {
      mapped.push(emptyTestChat);
    }

    return mapped.sort((a, b) => b.timestamp - a.timestamp);
  }, [cacheData?.conversations, createEmptyTestChat]);

  /**
   * Derive loading states from cache state
   */
  const isLoading =
    cacheState.status === 'idle' ||
    cacheState.status === 'loading-cache' ||
    (cacheState.status === 'loading-page' && cacheState.page === 0);

  const isLoadingMore = cacheState.status === 'loading-page' && cacheState.page > 0;

  return {
    conversations,
    isLoading,
    isLoadingMore,
    hasMore: cacheData?.hasMore ?? true,
    error,
    loadMore,
    refresh,
    updateConversation,
    removeConversations,
    cacheState,
  };
};
