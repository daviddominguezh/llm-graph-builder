
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useParams } from 'next/navigation';

import { getCurrentFirebaseUser } from '@/app/components/messages/services/firebase';

import { formatPhone } from '@/app/utils/strs';

import { getLastMessagesFromStore } from '@/app/components/messages/store';

import type { ChatSearchResults, Conversation, LastMessage, Message } from '@/app/types/chat';

import { createSearchService } from '../services';
import { useChat } from './ChatContext';

interface Modal {
  id: string;
  isOpen: boolean;
  data?: unknown;
}

export interface ChatWithId extends LastMessage {
  chatId: string;
}

export interface MessageMatch {
  chatId: string;
  message: Message;
  chatName?: string;
}

interface UIContextValue {
  // Modals
  modals: Record<string, Modal>;
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: (modalId: string) => void;
  isModalOpen: (modalId: string) => boolean;
  getModalData: (modalId: string) => unknown;

  // Sidebar
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearchActive: boolean;
  searchResults: ChatSearchResults;
  filteredChatsPhone: ChatWithId[];
  filteredChatsName: ChatWithId[];
  messageMatches: MessageMatch[];
  performSearch: (term: string) => void;
  clearSearch: () => void;

  // ChatsSearch Filters
  statusFilter: string;
  assigneeFilter: string;
  setStatusFilter: (status: string) => void;
  setAssigneeFilter: (assignee: string) => void;
}

const UIContext = createContext<UIContextValue>({} as UIContextValue);

interface UIProviderProps {
  children: React.ReactNode;
}

export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : (params.projectName?.[0] ?? 'nike');
  // Get data from ChatContext
  const { activeChat, messages: loadedMessages, orderedChats } = useChat();
  // Get data from Redux
  const lastMessages = useSelector(getLastMessagesFromStore);
  const [modals, setModals] = useState<Record<string, Modal>>({});
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ChatSearchResults>({ results: [], totalMatches: 0 });

  // ChatsSearch filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('none');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Create search service instance (persists across renders)
  const [searchService] = useState(() => createSearchService());

  // Get current user email for filter logic
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const firebaseUser = await getCurrentFirebaseUser();
      setCurrentUserEmail(firebaseUser?.email || null);
    };
    fetchCurrentUser();
  }, []);

  // Index conversations when they change
  useEffect(() => {
    if (lastMessages) {
      searchService.indexConversations(lastMessages);
    }
  }, [lastMessages, searchService]);

  // Index active chat messages when they change
  useEffect(() => {
    if (activeChat && loadedMessages) {
      searchService.indexChatMessages(activeChat, loadedMessages);
    }
  }, [activeChat, loadedMessages, searchService]);

  const openModal = useCallback((modalId: string, data?: unknown) => {
    setModals((prev) => ({
      ...prev,
      [modalId]: { id: modalId, isOpen: true, data },
    }));
  }, []);

  const closeModal = useCallback((modalId: string) => {
    setModals((prev) => ({
      ...prev,
      [modalId]: { ...prev[modalId], isOpen: false },
    }));
  }, []);

  const isModalOpen = useCallback(
    (modalId: string) => {
      return modals[modalId]?.isOpen || false;
    },
    [modals]
  );

  const getModalData = useCallback(
    (modalId: string) => {
      return modals[modalId]?.data;
    },
    [modals]
  );

  // Search logic using SearchService (replaces 100+ lines of inline search)
  const performSearchInternal = useCallback(
    (term: string): ChatSearchResults => {
      if (!lastMessages) {
        return { results: [], totalMatches: 0 };
      }

      return searchService.search(term, lastMessages, {
        activeChat,
        loadedMessages,
        projectName,
      });
    },
    [lastMessages, searchService, activeChat, loadedMessages, projectName]
  );

  const performSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      if (term.trim().length === 0) {
        setSearchResults({ results: [], totalMatches: 0 });
        return;
      }
      const results = performSearchInternal(term);
      setSearchResults(results);
    },
    [performSearchInternal]
  );

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setSearchResults({ results: [], totalMatches: 0 });
  }, []);

  const isSearchActive = searchTerm.length > 0;

  // Helper function to get latest assignee from chat (highest timestamp)
  const getLatestAssignee = useCallback((chat: ChatWithId): string | null => {
    if (!chat.assignees) return null;
    const assigneeEntries = Object.values(chat.assignees);
    if (assigneeEntries.length === 0) return null;
    const latest = assigneeEntries.reduce((prev, curr) => (curr.timestamp > prev.timestamp ? curr : prev));
    return latest.assignee;
  }, []);

  // Helper function to get latest status from chat (highest timestamp, default 'open')
  const getLatestStatus = useCallback((chat: ChatWithId): string => {
    if (!chat.statuses) return 'open';
    const statusEntries = Object.values(chat.statuses);
    if (statusEntries.length === 0) return 'open';
    const latest = statusEntries.reduce((prev, curr) => (curr.timestamp > prev.timestamp ? curr : prev));
    return latest.status;
  }, []);

  // Apply ChatsSearch filters to a list of chats
  const applyChatsSearchFilters = useCallback(
    (chats: ChatWithId[]): ChatWithId[] => {
      return chats.filter((chat) => {
        // Apply status filter
        if (statusFilter !== 'all') {
          // Special handling for "unanswered" filter
          if (statusFilter === 'unanswered') {
            // Filter by unansweredCount > 0
            if ((chat.unansweredCount ?? 0) <= 0) return false;
          } else {
            // Regular status filtering
            const chatStatus = getLatestStatus(chat);
            if (chatStatus !== statusFilter) return false;
          }
        }

        // Apply assignee filter
        if (assigneeFilter !== 'none') {
          const chatAssignee = getLatestAssignee(chat);
          if (chatAssignee !== assigneeFilter) return false;
        }

        return true;
      });
    },
    [statusFilter, assigneeFilter, getLatestAssignee, getLatestStatus]
  );

  // Filtered chats by phone
  const filteredChatsPhone = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }
    const phoneMatchIds = new Set(searchResults.results.filter((r) => r.phoneMatch).map((r) => r.chatId));
    const phoneMatches = orderedChats.filter((chat) => phoneMatchIds.has(chat.chatId));

    // Apply ChatsSearch filters
    return applyChatsSearchFilters(phoneMatches);
  }, [isSearchActive, searchResults, orderedChats, applyChatsSearchFilters]);

  // Filtered chats by name
  const filteredChatsName = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }
    const nameMatchIds = new Set(searchResults.results.filter((r) => r.nameMatch).map((r) => r.chatId));
    const nameMatches = orderedChats.filter((chat) => nameMatchIds.has(chat.chatId));

    // Apply ChatsSearch filters
    return applyChatsSearchFilters(nameMatches);
  }, [isSearchActive, searchResults, orderedChats, applyChatsSearchFilters]);

  // Message matches
  const messageMatches = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }

    const matches: MessageMatch[] = [];
    const seenMessages = new Set<string>();

    // Get results where messages matched
    const messageResults = searchResults.results.filter(
      (r) => r.matchType === 'message' || r.matchType === 'both'
    );

    messageResults.forEach((result) => {
      const chat = lastMessages?.[result.chatId];
      if (!chat) return;

      const chatName = chat.name || formatPhone(result.chatId.replace('whatsapp:', '')) || undefined;

      let messagesToDisplay: Conversation | null = null;

      // First, check if this is the active chat with loaded messages
      if (activeChat === result.chatId && loadedMessages) {
        messagesToDisplay = loadedMessages;
      } else {
        // Try to get from localStorage with correct key format
        const cacheKey = `messagesDashboard:${projectName}:messages-${result.chatId}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            // CacheService wraps data in { data, timestamp, expiresAt }
            messagesToDisplay = parsed.data as Conversation;
          } catch (e) {
            console.error('Error parsing cached messages for display:', e);
          }
        }
      }

      if (messagesToDisplay) {
        result.matchingMessageIds.forEach((msgId) => {
          const message = messagesToDisplay[msgId];
          if (!seenMessages.has(msgId) && message) {
            matches.push({
              chatId: result.chatId,
              message,
              chatName,
            });
            seenMessages.add(msgId);
          }
        });
      } else if (result.matchingMessageIds.includes(chat.id)) {
        // Add last message if it matched
        if (!seenMessages.has(chat.id)) {
          matches.push({
            chatId: result.chatId,
            message: chat as Message,
            chatName,
          });
          seenMessages.add(chat.id);
        }
      }
    });

    // Apply ChatsSearch filters to message matches
    return matches.filter((match) => {
      const chat = orderedChats.find((c) => c.chatId === match.chatId);
      if (!chat) return false;

      // Apply status filter
      if (statusFilter !== 'all') {
        const chatStatus = getLatestStatus(chat);
        if (chatStatus !== statusFilter) return false;
      }

      // Apply assignee filter
      if (assigneeFilter !== 'none') {
        const chatAssignee = getLatestAssignee(chat);
        if (chatAssignee !== assigneeFilter) return false;
      }

      return true;
    });
  }, [
    isSearchActive,
    searchResults,
    lastMessages,
    projectName,
    activeChat,
    loadedMessages,
    orderedChats,
    statusFilter,
    assigneeFilter,
    getLatestStatus,
    getLatestAssignee,
  ]);

  const value: UIContextValue = useMemo(
    () => ({
      modals,
      openModal,
      closeModal,
      isModalOpen,
      getModalData,
      isSidebarOpen,
      setSidebarOpen,
      searchTerm,
      setSearchTerm,
      isSearchActive,
      searchResults,
      filteredChatsPhone,
      filteredChatsName,
      messageMatches,
      performSearch,
      clearSearch,
      statusFilter,
      assigneeFilter,
      setStatusFilter,
      setAssigneeFilter,
    }),
    [
      modals,
      openModal,
      closeModal,
      isModalOpen,
      getModalData,
      isSidebarOpen,
      setSidebarOpen,
      searchTerm,
      setSearchTerm,
      isSearchActive,
      searchResults,
      filteredChatsPhone,
      filteredChatsName,
      messageMatches,
      performSearch,
      clearSearch,
      statusFilter,
      assigneeFilter,
      setStatusFilter,
      setAssigneeFilter,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
};
