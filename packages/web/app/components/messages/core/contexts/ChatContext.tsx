import type { Note } from '@/app/components/messages/services/api';
import { getLastMessagesFromStore, setLastMessage } from '@/app/components/messages/store';
import { getBusinessSetup } from '@/app/components/messages/store/stubs';
import { TEST_PHONE } from '@/app/constants/messages';
import type { BusinessSetupSchemaAPIType } from '@/app/types/business';
import { INTENT } from '@/app/types/chat';
import type { Conversation, LastMessage, Message } from '@/app/types/chat';
import { useParams } from 'next/navigation';
import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useConversationMessagesWithCache } from '../../hooks/useConversationMessagesWithCache';
import { useLastMessagesWithCache } from '../../hooks/useLastMessagesWithCache';
import { useMessageRepository } from '../../hooks/useMessageRepository';

export interface ChatWithId extends LastMessage {
  chatId: string;
}

interface ChatContextValue {
  // State
  activeChat: string | null;
  messages: Conversation;
  currentChat: LastMessage | null;
  isTestChatActive: boolean;

  // Actions
  selectChat: (chatId: string | null, shouldMarkRead?: boolean) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;

  // Message manipulation (for sync/realtime updates)
  addMessage: (message: Message) => void;
  addMessages: (newMessages: Conversation) => void;
  updateMessage: (messageId: string, update: Partial<Message>) => void;
  replaceOptimisticMessage: (optimisticId: string, realMessage: Message) => void;
  removeMessages: (messageIds: string[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<Conversation>>;

  // Message pagination (for virtualization)
  messagesArray: Message[];
  loadOlderMessages: () => Promise<void>;
  hasMoreOlderMessages: boolean;
  isLoadingMessages: boolean;
  isLoadingOlderMessages: boolean;
  refreshMessages: () => Promise<void>;

  // Data
  orderedChats: ChatWithId[];

  // Notes
  notes: Record<string, Note>;
  setNotes: React.Dispatch<React.SetStateAction<Record<string, Note>>>;

  // Notes refresh trigger
  notesRefreshTrigger: number;
  triggerNotesRefresh: () => void;

  // Business info (cached, fetched on mount)
  businessInfo: BusinessSetupSchemaAPIType | null;
  businessInfoLoading: boolean;
  refetchBusinessInfo: () => Promise<void>;

  // Pagination & cache state
  loadMoreConversations: () => Promise<void>;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  isLoadingConversations: boolean;
  refreshConversations: () => Promise<void>;
  /** Update a conversation in cache (e.g., from socket) */
  updateCachedConversation: (chatId: string, lastMessage: LastMessage) => Promise<void>;
  /** Remove conversations from cache (e.g., deleted chats) */
  removeCachedConversations: (chatIds: string[]) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue>({} as ChatContextValue);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const params = useParams();
  const projectName =
    typeof params.projectName === 'string' ? params.projectName : (params.projectName?.[0] ?? 'nike');
  const repository = useMessageRepository();
  const dispatch = useDispatch();
  const lastMessages = useSelector(getLastMessagesFromStore);

  // Use the new cache hook for conversations with pagination
  const {
    conversations: cachedConversations,
    isLoading: isLoadingConversations,
    isLoadingMore: isLoadingMoreConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    refresh: refreshConversations,
    updateConversation: updateCachedConversation,
    removeConversations: removeCachedConversations,
  } = useLastMessagesWithCache(projectName || '');

  const [activeChat, setActiveChat] = useState<string | null>(null);

  // Use the new cache hook for conversation messages with pagination
  const {
    messages: messagesArray,
    messagesRecord: messages,
    isLoading: isLoadingMessages,
    isLoadingOlder: isLoadingOlderMessages,
    hasMoreOlder: hasMoreOlderMessages,
    loadOlderMessages,
    addMessage: hookAddMessage,
    addMessages: hookAddMessages,
    updateMessage: hookUpdateMessage,
    replaceOptimisticMessage: hookReplaceOptimisticMessage,
    removeMessages: hookRemoveMessages,
    refresh: refreshMessages,
  } = useConversationMessagesWithCache(projectName || '', activeChat);

  // Wrapper for setMessages to maintain backward compatibility
  // This is a no-op since we're now using the hook's state
  const setMessages = useCallback((updater: React.SetStateAction<Conversation>) => {
    // The hook manages message state now, so this is a no-op for external callers
    // Direct state manipulation should use addMessage/addMessages/updateMessage instead
    void updater; // Parameter required for type compatibility but intentionally unused
    console.warn(
      '[ChatContext] setMessages is deprecated. Use addMessage/addMessages/updateMessage instead.'
    );
  }, []);

  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [notesRefreshTrigger, setNotesRefreshTrigger] = useState(0);

  // Read business info from Redux store (populated by project/index.tsx)
  const businessInfo = useSelector(getBusinessSetup);
  const businessInfoLoading = !businessInfo;

  // Compute derived state
  const isTestChatActive = activeChat === TEST_PHONE;
  // Use cached conversations for currentChat lookup
  const currentChat = useMemo(() => {
    if (!activeChat) return null;
    // First try from cached conversations
    const cached = cachedConversations.find((c) => c.key === activeChat);
    if (cached) return cached;
    // Fallback to Redux (for backward compatibility)
    return lastMessages?.[activeChat] || null;
  }, [activeChat, cachedConversations, lastMessages]);

  // Stable timestamp for the default test chat fallback (only set once on mount)
  const [defaultTestChatTimestamp] = useState(() => Date.now());

  // Build orderedChats from cached conversations (already sorted by timestamp)
  const orderedChats = useMemo(() => {
    // Map cached conversations to ChatWithId format
    const allChats: ChatWithId[] = cachedConversations.map((chat) => ({
      ...chat,
      chatId: chat.key ?? '',
    }));

    // Separate test chat from regular chats (if it exists in cache)
    const cachedTestChat = allChats.find((chat) => chat.chatId === TEST_PHONE);
    const regularChats = allChats.filter((chat) => chat.chatId !== TEST_PHONE);

    // Check Redux for test chat (socket updates go to Redux)
    const reduxTestChat = lastMessages?.[TEST_PHONE];

    // Use the most recent test chat data: cached, Redux, or create default
    // Priority: Redux (real-time) > Cached (IndexedDB) > Default
    let testChat: ChatWithId;

    if (reduxTestChat && (!cachedTestChat || reduxTestChat.timestamp > cachedTestChat.timestamp)) {
      // Redux has newer data (from socket)
      testChat = {
        ...reduxTestChat,
        chatId: TEST_PHONE,
        key: TEST_PHONE,
      };
    } else if (cachedTestChat) {
      // Use cached data
      testChat = cachedTestChat;
    } else {
      // Create default test chat
      testChat = {
        chatId: TEST_PHONE,
        key: TEST_PHONE,
        originalId: '',
        id: TEST_PHONE,
        timestamp: defaultTestChatTimestamp,
        intent: INTENT.NONE,
        message: { role: 'assistant', content: '' },
        type: 'text',
        read: true,
        enabled: true,
        name: 'Test Chat',
      };
    }

    // Test chat is kept first
    return [testChat, ...regularChats];
  }, [cachedConversations, lastMessages, defaultTestChatTimestamp]);

  const selectChat = useCallback(
    async (chatId: string | null, shouldMarkRead = false) => {
      if (chatId === activeChat) return;

      // Use startTransition to prevent state update from blocking async operations
      startTransition(() => {
        setActiveChat(chatId);
      });

      // Note: Messages are now loaded automatically by useConversationMessagesWithCache
      // when activeChat changes

      // Mark as read if needed
      if (chatId && shouldMarkRead) {
        const chat = lastMessages?.[chatId];
        if (chat) {
          await repository.markAsRead(projectName || '', chatId, chat);
        }
      }
    },
    [activeChat, projectName, repository, lastMessages]
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (chatId === activeChat) {
        setActiveChat(null);
        // Messages will be cleared automatically by the hook when activeChat becomes null
      }

      // Special handling for test chat - empty it instead of removing
      if (chatId === TEST_PHONE) {
        // Create empty test chat entry
        const emptyTestChat: LastMessage = {
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
        };

        // Update Redux with empty test chat
        dispatch(
          setLastMessage({
            id: TEST_PHONE,
            lastMessage: emptyTestChat,
            preventFetch: true,
          })
        );

        // Still call API to delete messages on backend
        await repository.deleteConversation(projectName || '', chatId);
      } else {
        // Regular chat deletion
        await repository.deleteConversation(projectName || '', chatId);
      }
    },
    [activeChat, projectName, repository, dispatch]
  );

  // Note: Initial conversation loading is now handled by useLastMessagesWithCache hook
  // The hook loads from IndexedDB first, then syncs with the server

  // Refetch business info - triggers re-fetch in project/index.tsx via Redux
  // Note: This is a no-op since business info is managed by project/index.tsx
  // If you need to force refresh, you would need to implement a refresh action in the business reducer
  const refetchBusinessInfo = useCallback(async () => {
    // Business info is fetched and managed by project/index.tsx
    // This function is kept for API compatibility but doesn't re-fetch
    // since the data is already in Redux from the initial load
  }, []);

  // Initialize test chat if it doesn't exist
  useEffect(() => {
    if (!lastMessages) return;

    // Check if test chat already exists
    if (!lastMessages[TEST_PHONE]) {
      // Create test chat entry
      const testChatEntry: LastMessage = {
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
      };

      dispatch(
        setLastMessage({
          id: TEST_PHONE,
          lastMessage: testChatEntry,
          preventFetch: true,
        })
      );
    }
  }, [lastMessages, dispatch]);

  // Message manipulation methods for realtime sync - delegate to hook
  const addMessage = useCallback(
    (message: Message) => {
      hookAddMessage(message);
    },
    [hookAddMessage]
  );

  const addMessages = useCallback(
    (newMessages: Conversation) => {
      hookAddMessages(newMessages);
    },
    [hookAddMessages]
  );

  const updateMessage = useCallback(
    (messageId: string, update: Partial<Message>) => {
      hookUpdateMessage(messageId, update);
    },
    [hookUpdateMessage]
  );

  const replaceOptimisticMessage = useCallback(
    (optimisticId: string, realMessage: Message) => {
      hookReplaceOptimisticMessage(optimisticId, realMessage);
    },
    [hookReplaceOptimisticMessage]
  );

  const removeMessages = useCallback(
    (messageIds: string[]) => {
      hookRemoveMessages(messageIds);
    },
    [hookRemoveMessages]
  );

  const triggerNotesRefresh = useCallback(() => {
    setNotesRefreshTrigger((prev) => prev + 1);
  }, []);

  const value: ChatContextValue = useMemo(
    () => ({
      activeChat,
      messages,
      currentChat,
      isTestChatActive,
      selectChat,
      deleteChat,
      addMessage,
      addMessages,
      updateMessage,
      replaceOptimisticMessage,
      removeMessages,
      setMessages,
      // Message pagination (for virtualization)
      messagesArray,
      loadOlderMessages,
      hasMoreOlderMessages,
      isLoadingMessages,
      isLoadingOlderMessages,
      refreshMessages,
      orderedChats,
      notes,
      setNotes,
      notesRefreshTrigger,
      triggerNotesRefresh,
      businessInfo,
      businessInfoLoading,
      refetchBusinessInfo,
      // Pagination & cache
      loadMoreConversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      isLoadingConversations,
      refreshConversations,
      updateCachedConversation,
      removeCachedConversations,
    }),
    [
      activeChat,
      messages,
      currentChat,
      isTestChatActive,
      selectChat,
      deleteChat,
      addMessage,
      addMessages,
      updateMessage,
      replaceOptimisticMessage,
      removeMessages,
      setMessages,
      messagesArray,
      loadOlderMessages,
      hasMoreOlderMessages,
      isLoadingMessages,
      isLoadingOlderMessages,
      refreshMessages,
      orderedChats,
      notes,
      setNotes,
      notesRefreshTrigger,
      triggerNotesRefresh,
      businessInfo,
      businessInfoLoading,
      refetchBusinessInfo,
      loadMoreConversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      isLoadingConversations,
      refreshConversations,
      updateCachedConversation,
      removeCachedConversations,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};
