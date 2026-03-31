import { ConversationMessagesCacheService } from '@features/messagesDashboard/core/services/ConversationMessagesCacheService';
import type {
  ConversationMessagesCacheData,
  ConversationMessagesCacheState,
  PaginationCursor,
} from '@features/messagesDashboard/core/types/conversationMessagesCache.types';
import { CONVERSATION_MESSAGES_EMPTY_CACHE } from '@features/messagesDashboard/core/types/conversationMessagesCache.types';
import { getMessagesFromSender, getMessagesFromSenderPaginated } from '@services/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Conversation, Message } from '@globalTypes/chat';

interface UseConversationMessagesWithCacheReturn {
  /** Sorted array of messages (oldest first for display) */
  messages: Message[];
  /** Messages as a record (for compatibility with existing code) */
  messagesRecord: Conversation;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading older messages is in progress */
  isLoadingOlder: boolean;
  /** Whether there are more older messages to load */
  hasMoreOlder: boolean;
  /** Current error, if any */
  error: Error | null;
  /** Load older messages (scroll-up pagination) */
  loadOlderMessages: () => Promise<void>;
  /** Add a new message (real-time) */
  addMessage: (message: Message) => void;
  /** Add multiple messages */
  addMessages: (messages: Conversation) => void;
  /** Update a message */
  updateMessage: (messageId: string, update: Partial<Message>) => void;
  /** Replace an optimistic message with the real one */
  replaceOptimisticMessage: (optimisticId: string, realMessage: Message) => void;
  /** Remove messages by their IDs (for removing optimistic messages) */
  removeMessages: (messageIds: string[]) => void;
  /** Refresh messages (fetch new since last) */
  refresh: () => Promise<void>;
  /** Clear the conversation cache */
  clearCache: () => Promise<void>;
  /** Current cache state */
  cacheState: ConversationMessagesCacheState;
}

/**
 * Hook to manage conversation messages with IndexedDB caching and pagination
 *
 * Flow:
 * 1. On mount (when chatId changes): Load from IndexedDB → show cached data immediately
 * 2. If cache exists: Fetch new messages since last cached (delta)
 * 3. If no cache: Fetch paginated (last 50 messages)
 * 4. On scroll-up: Load older messages with cursor
 * 5. On real-time: Append new messages
 */
export const useConversationMessagesWithCache = (
  projectName: string,
  chatId: string | null
): UseConversationMessagesWithCacheReturn => {
  const [cacheData, setCacheData] = useState<ConversationMessagesCacheData | null>(null);
  const [cacheState, setCacheState] = useState<ConversationMessagesCacheState>({ status: 'idle' });
  const [error, setError] = useState<Error | null>(null);

  // Ref to prevent duplicate loads
  const loadingRef = useRef(false);
  // Ref to track current chatId for async operations
  const currentChatIdRef = useRef<string | null>(chatId);

  // Keep ref in sync
  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  /**
   * Calculate metadata from messages
   */
  const calculateMetadata = useCallback((messages: Record<string, Message>) => {
    let newestTimestamp = 0;
    let oldestTimestamp = Number.MAX_SAFE_INTEGER;
    let newestMessageId: string | null = null;
    let oldestMessageId: string | null = null;

    for (const [id, msg] of Object.entries(messages)) {
      if (msg.timestamp > newestTimestamp) {
        newestTimestamp = msg.timestamp;
        newestMessageId = id;
      }
      if (msg.timestamp < oldestTimestamp) {
        oldestTimestamp = msg.timestamp;
        oldestMessageId = id;
      }
    }

    return {
      newestTimestamp,
      oldestTimestamp: oldestTimestamp === Number.MAX_SAFE_INTEGER ? 0 : oldestTimestamp,
      newestMessageId,
      oldestMessageId,
    };
  }, []);

  /**
   * Initial load: Read from IndexedDB then sync with server
   */
  const initialLoad = useCallback(async () => {
    if (loadingRef.current || !projectName || !chatId) return;
    loadingRef.current = true;

    try {
      // 1. Load from IndexedDB
      setCacheState({ status: 'loading-cache' });
      const cached = await ConversationMessagesCacheService.getCache(projectName, chatId);

      if (cached && Object.keys(cached.messages).length > 0) {
        // Cache exists - show immediately and fetch new messages
        setCacheData(cached);
        setCacheState({ status: 'loading-newer' });

        // Fetch only new messages since our newest cached message
        if (cached.newestMessageId) {
          const newMessages = await getMessagesFromSender(projectName, chatId, cached.newestMessageId);

          // Check if we're still on the same chat
          if (currentChatIdRef.current !== chatId) {
            loadingRef.current = false;
            return;
          }

          if (newMessages && Object.keys(newMessages).length > 0) {
            // Append new messages to cache
            const updatedCache = await ConversationMessagesCacheService.appendMessages(
              projectName,
              chatId,
              newMessages
            );
            setCacheData(updatedCache);
          }
        }
      } else {
        // No cache - fetch paginated (last 50 messages)
        setCacheState({ status: 'loading-initial' });

        const paginatedResponse = await getMessagesFromSenderPaginated(projectName, chatId);

        // Check if we're still on the same chat
        if (currentChatIdRef.current !== chatId) {
          loadingRef.current = false;
          return;
        }

        if (
          paginatedResponse &&
          paginatedResponse.messages &&
          Object.keys(paginatedResponse.messages).length > 0
        ) {
          const metadata = calculateMetadata(paginatedResponse.messages);

          // Use cursor from API response (contains timestamp and key)
          const cursor: PaginationCursor | null = paginatedResponse.nextCursor || null;

          const newCacheData: ConversationMessagesCacheData = {
            messages: paginatedResponse.messages,
            newestTimestamp: metadata.newestTimestamp,
            oldestLoadedTimestamp: metadata.oldestTimestamp,
            hasMoreOlder: paginatedResponse.hasMore,
            oldestCursor: cursor,
            newestMessageId: metadata.newestMessageId,
          };

          setCacheData(newCacheData);
          await ConversationMessagesCacheService.setCache(projectName, chatId, newCacheData);
        } else {
          // No data available or empty response
          setCacheData({ ...CONVERSATION_MESSAGES_EMPTY_CACHE });
        }
      }

      setCacheState({ status: 'ready' });
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load messages');
      setError(error);
      setCacheState({ status: 'error', error });
      console.error('[useConversationMessagesWithCache] initialLoad error:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [projectName, chatId, calculateMetadata]);

  /**
   * Load older messages (scroll-up pagination)
   */
  const loadOlderMessages = useCallback(async () => {
    if (
      loadingRef.current ||
      !projectName ||
      !chatId ||
      !cacheData?.hasMoreOlder ||
      !cacheData?.oldestCursor ||
      cacheState.status !== 'ready'
    ) {
      return;
    }

    // Validate cursor has both required fields
    const cursor = cacheData.oldestCursor;
    if (!cursor.key || !cursor.timestamp) {
      console.warn(
        '[useConversationMessagesWithCache] Invalid cursor (missing key or timestamp), cannot load older messages'
      );
      return;
    }

    loadingRef.current = true;
    setCacheState({ status: 'loading-older' });

    try {
      const response = await getMessagesFromSenderPaginated(projectName, chatId, {
        cursorKey: cursor.key,
        cursorTimestamp: cursor.timestamp,
      });

      // Check if we're still on the same chat
      if (currentChatIdRef.current !== chatId) {
        loadingRef.current = false;
        setCacheState({ status: 'ready' });
        return;
      }

      if (response && response.messages) {
        const newMessagesCount = Object.keys(response.messages).length;

        // If no new messages returned, stop pagination to prevent infinite loop
        if (newMessagesCount === 0) {
          console.log('[useConversationMessagesWithCache] No new messages returned, stopping pagination');
          setCacheData((prev) => (prev ? { ...prev, hasMoreOlder: false } : prev));
          setCacheState({ status: 'ready' });
          loadingRef.current = false;
          return;
        }

        // Use cursor from API response (contains timestamp and key)
        const nextCursor: PaginationCursor | null = response.nextCursor || null;

        const updatedCache = await ConversationMessagesCacheService.prependMessages(
          projectName,
          chatId,
          response.messages,
          response.hasMore,
          nextCursor
        );
        setCacheData(updatedCache);
      }

      setCacheState({ status: 'ready' });
    } catch (err) {
      console.error('[useConversationMessagesWithCache] loadOlderMessages error:', err);
      setCacheState({ status: 'ready' });
    } finally {
      loadingRef.current = false;
    }
  }, [projectName, chatId, cacheData, cacheState.status]);

  /**
   * Add a new message (real-time)
   */
  const addMessage = useCallback(
    (message: Message) => {
      setCacheData((prev) => {
        if (!prev) return prev;

        const newMessages = {
          ...prev.messages,
          [message.id]: message,
        };

        const isNewer = message.timestamp > prev.newestTimestamp;

        return {
          ...prev,
          messages: newMessages,
          newestTimestamp: isNewer ? message.timestamp : prev.newestTimestamp,
          newestMessageId: isNewer ? message.id : prev.newestMessageId,
        };
      });

      // Also persist to IndexedDB
      if (projectName && chatId) {
        ConversationMessagesCacheService.appendMessages(projectName, chatId, {
          [message.id]: message,
        }).catch((err) => {
          console.error('[useConversationMessagesWithCache] Failed to persist message:', err);
        });
      }
    },
    [projectName, chatId]
  );

  /**
   * Add multiple messages
   */
  const addMessages = useCallback(
    (messages: Conversation) => {
      setCacheData((prev) => {
        if (!prev) return prev;

        const newMessages = {
          ...prev.messages,
          ...messages,
        };

        // Recalculate newest
        let newestTimestamp = prev.newestTimestamp;
        let newestMessageId = prev.newestMessageId;

        for (const [id, msg] of Object.entries(messages)) {
          if (msg.timestamp > newestTimestamp) {
            newestTimestamp = msg.timestamp;
            newestMessageId = id;
          }
        }

        return {
          ...prev,
          messages: newMessages,
          newestTimestamp,
          newestMessageId,
        };
      });

      // Also persist to IndexedDB
      if (projectName && chatId) {
        ConversationMessagesCacheService.appendMessages(projectName, chatId, messages).catch((err) => {
          console.error('[useConversationMessagesWithCache] Failed to persist messages:', err);
        });
      }
    },
    [projectName, chatId]
  );

  /**
   * Update a message
   */
  const updateMessage = useCallback(
    (messageId: string, update: Partial<Message>) => {
      setCacheData((prev) => {
        if (!prev || !prev.messages[messageId]) return prev;

        return {
          ...prev,
          messages: {
            ...prev.messages,
            [messageId]: { ...prev.messages[messageId], ...update },
          },
        };
      });

      // Also persist to IndexedDB
      if (projectName && chatId) {
        ConversationMessagesCacheService.updateMessage(projectName, chatId, messageId, update).catch(
          (err) => {
            console.error('[useConversationMessagesWithCache] Failed to update message:', err);
          }
        );
      }
    },
    [projectName, chatId]
  );

  /**
   * Replace an optimistic message with the real one
   */
  const replaceOptimisticMessage = useCallback(
    (optimisticId: string, realMessage: Message) => {
      setCacheData((prev) => {
        if (!prev) return prev;

        // Remove optimistic message and add real one
        const { [optimisticId]: removedMessage, ...restMessages } = prev.messages;
        void removedMessage; // Intentionally discarding the removed message
        const newMessages = {
          ...restMessages,
          [realMessage.id]: realMessage,
        };

        const isNewer = realMessage.timestamp > prev.newestTimestamp;

        return {
          ...prev,
          messages: newMessages,
          newestTimestamp: isNewer ? realMessage.timestamp : prev.newestTimestamp,
          newestMessageId: isNewer ? realMessage.id : prev.newestMessageId,
        };
      });

      // Also persist to IndexedDB
      if (projectName && chatId) {
        ConversationMessagesCacheService.appendMessages(projectName, chatId, {
          [realMessage.id]: realMessage,
        }).catch((err) => {
          console.error('[useConversationMessagesWithCache] Failed to persist replaced message:', err);
        });
      }
    },
    [projectName, chatId]
  );

  /**
   * Remove messages by their IDs (for removing optimistic messages)
   */
  const removeMessages = useCallback((messageIds: string[]) => {
    if (messageIds.length === 0) return;

    setCacheData((prev) => {
      if (!prev) return prev;

      // Filter out the messages to remove
      const idsToRemove = new Set(messageIds);
      const newMessages = Object.fromEntries(
        Object.entries(prev.messages).filter(([id]) => !idsToRemove.has(id))
      );

      // Recalculate metadata
      let newestTimestamp = 0;
      let newestMessageId: string | null = null;
      for (const [id, msg] of Object.entries(newMessages)) {
        if (msg.timestamp > newestTimestamp) {
          newestTimestamp = msg.timestamp;
          newestMessageId = id;
        }
      }

      return {
        ...prev,
        messages: newMessages,
        newestTimestamp,
        newestMessageId,
      };
    });

    // Note: We don't persist removals to IndexedDB since these are typically
    // optimistic messages that were never persisted in the first place
  }, []);

  /**
   * Refresh messages (fetch new since last)
   */
  const refresh = useCallback(async () => {
    if (!projectName || !chatId || !cacheData?.newestMessageId) return;

    try {
      setCacheState({ status: 'loading-newer' });

      const newMessages = await getMessagesFromSender(projectName, chatId, cacheData.newestMessageId);

      if (currentChatIdRef.current !== chatId) {
        setCacheState({ status: 'ready' });
        return;
      }

      if (newMessages && Object.keys(newMessages).length > 0) {
        const updatedCache = await ConversationMessagesCacheService.appendMessages(
          projectName,
          chatId,
          newMessages
        );
        setCacheData(updatedCache);
      }

      setCacheState({ status: 'ready' });
    } catch (err) {
      console.error('[useConversationMessagesWithCache] refresh error:', err);
      setCacheState({ status: 'ready' });
    }
  }, [projectName, chatId, cacheData?.newestMessageId]);

  /**
   * Clear the conversation cache
   */
  const clearCache = useCallback(async () => {
    if (!projectName || !chatId) return;

    await ConversationMessagesCacheService.clearConversationCache(projectName, chatId);
    setCacheData(null);
    setCacheState({ status: 'idle' });
  }, [projectName, chatId]);

  /**
   * Load on mount and when chatId changes
   */
  useEffect(() => {
    if (!chatId) {
      setCacheData(null);
      setCacheState({ status: 'idle' });
      return;
    }

    // Reset state for new chat
    setCacheData(null);
    setCacheState({ status: 'idle' });
    loadingRef.current = false;

    // Load messages for the new chat
    initialLoad();
  }, [chatId, initialLoad]);

  /**
   * Convert messages to sorted array (oldest first for display)
   */
  const messages = useMemo(() => {
    if (!cacheData?.messages) {
      return [];
    }

    return Object.values(cacheData.messages).sort((a, b) => a.timestamp - b.timestamp);
  }, [cacheData?.messages]);

  /**
   * Messages as record (for compatibility)
   */
  const messagesRecord = useMemo(() => {
    return cacheData?.messages || {};
  }, [cacheData?.messages]);

  /**
   * Derive loading states from cache state
   */
  const isLoading =
    cacheState.status === 'idle' ||
    cacheState.status === 'loading-cache' ||
    cacheState.status === 'loading-initial';

  const isLoadingOlder = cacheState.status === 'loading-older';

  return {
    messages,
    messagesRecord,
    isLoading,
    isLoadingOlder,
    hasMoreOlder: cacheData?.hasMoreOlder ?? true,
    error,
    loadOlderMessages,
    addMessage,
    addMessages,
    updateMessage,
    replaceOptimisticMessage,
    removeMessages,
    refresh,
    clearCache,
    cacheState,
  };
};
