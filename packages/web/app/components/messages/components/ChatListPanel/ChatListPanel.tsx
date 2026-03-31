
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { MessageCircleOff } from 'lucide-react';

import { getCurrentFirebaseUser } from '@/app/components/messages/services/firebase';

import MessagePreview from '@/app/components/messages/shared/messagePreview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useIsMobile } from '@/app/utils/device';

import { TEST_PHONE } from '@/app/constants/messages';

import type { LastMessage, Message } from '@/app/types/chat';
import { Collaborator } from '@/app/types/projectInnerSettings';

import { ChatsSearch } from '../../chatsSearch';
import { useUI } from '../../core/contexts';
import { Slot } from '../../core/slots';
import { MessageSearchResult } from '../../messageSearchResult';

export interface ChatWithId extends LastMessage {
  chatId: string;
}

interface MessageMatch {
  chatId: string;
  chatName?: string;
  message: Message;
}

interface ChatListPanelProps {
  orderedChats: ChatWithId[];
  activeChat: string | null;
  isSearchActive: boolean;
  filteredChatsPhone: ChatWithId[];
  filteredChatsName: ChatWithId[];
  messageMatches: MessageMatch[];
  onChatSelect: (id: string | null, shouldMarkRead?: boolean) => Promise<void>;
  onSearchChange: (term: string) => void;
  onClearSearch: () => void;
  onMessageResultClick: (chatId: string, messageId: string) => void;
  chatFilter: string;
  onFilterChange: (filter: string) => void;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
  hideFilterDropdown?: boolean;
  /** Callback to load more conversations (pagination) */
  onLoadMore?: () => void;
  /** Whether there are more conversations to load */
  hasMore?: boolean;
  /** Whether currently loading more conversations */
  isLoadingMore?: boolean;
}

/**
 * ChatListPanel
 *
 * Displays the list of conversations with search and filtering capabilities.
 * Responsibilities:
 * - Render chat list (all or filtered)
 * - Handle search UI
 * - Display search results (chats by phone, name, or message content)
 * - Show empty states
 */
const ChatListPanelComponent: React.FC<ChatListPanelProps> = ({
  orderedChats,
  activeChat,
  isSearchActive,
  filteredChatsPhone,
  filteredChatsName,
  messageMatches,
  onChatSelect,
  onSearchChange,
  onClearSearch,
  onMessageResultClick,
  chatFilter,
  onFilterChange,
  collaborators,
  profilePictures,
  hideFilterDropdown = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();
  const chatListScrollRef = useRef<HTMLDivElement>(null);
  const SCROLL_STORAGE_KEY = 'chatListScrollPosition';
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const { setStatusFilter, setAssigneeFilter, statusFilter, assigneeFilter } = useUI();
  const isLoadingMoreRef = useRef(false);

  // Update ref when prop changes
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Handle scroll for infinite loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!onLoadMore || !hasMore || isLoadingMoreRef.current) return;

    const target = e.currentTarget;
    const scrollPercentage = (target.scrollTop + target.clientHeight) / target.scrollHeight;

    // Load more when scrolled past 50%
    if (scrollPercentage > 0.5) {
      onLoadMore();
    }
  };

  // Get current user email for "inbox" filter
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const firebaseUser = await getCurrentFirebaseUser();
      setCurrentUserEmail(firebaseUser?.email || null);
    };
    fetchCurrentUser();
  }, []);

  // Restore scroll position when component mounts or ref becomes available
  useEffect(() => {
    if (!chatListScrollRef.current) return;

    const savedScroll = sessionStorage.getItem(SCROLL_STORAGE_KEY);

    if (savedScroll) {
      const scrollValue = parseInt(savedScroll, 10);
      if (scrollValue > 0) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (chatListScrollRef.current) {
            chatListScrollRef.current.scrollTop = scrollValue;
            // Clear after restoring
            sessionStorage.removeItem(SCROLL_STORAGE_KEY);
          }
        });
      }
    }
  }, [activeChat]);

  // Save scroll position before it potentially resets
  const handleChatSelect = (id: string | null, shouldMarkRead?: boolean) => {
    if (chatListScrollRef.current) {
      const currentScroll = chatListScrollRef.current.scrollTop;
      sessionStorage.setItem(SCROLL_STORAGE_KEY, currentScroll.toString());
    }
    onChatSelect(id, shouldMarkRead);
  };

  // Helper function to get latest assignee from chat (highest timestamp)
  const getLatestAssignee = (chat: ChatWithId): string | null => {
    if (!chat.assignees) return null;
    const assigneeEntries = Object.values(chat.assignees);
    if (assigneeEntries.length === 0) return null;
    const latest = assigneeEntries.reduce((prev, curr) => (curr.timestamp > prev.timestamp ? curr : prev));
    return latest.assignee;
  };

  // Helper function to get status from chat
  // Default status is 'open' if no status has been set
  const getChatStatus = (chat: ChatWithId): string => {
    return chat.status || 'open';
  };

  // Filter chats based on active filter (shared between mobile and desktop)
  const displayedChats = useMemo(() => {
    switch (chatFilter) {
      case 'inbox':
        // Chats assigned to current user (exclude test chat)
        return orderedChats.filter((chat) => {
          if (chat.chatId === TEST_PHONE) return false; // Exclude test chat from inbox
          const lastAssignee = getLatestAssignee(chat);
          return lastAssignee === currentUserEmail;
        });

      case 'with-bot':
        // Chats with AI enabled (always includes test chat)
        return orderedChats.filter((chat) => chat.chatId === TEST_PHONE || chat.enabled === true);

      case 'unassigned':
        // Chats without assignee or assignee is "unassigned"/"none" AND AI turned off (exclude test chat)
        return orderedChats.filter((chat) => {
          if (chat.chatId === TEST_PHONE) return false; // Exclude test chat
          const lastAssignee = getLatestAssignee(chat);
          const isUnassigned = !lastAssignee || lastAssignee === 'unassigned' || lastAssignee === 'none';
          return isUnassigned && chat.enabled === false;
        });

      case 'open':
        // Chats with status "open" or "verify-payment" (exclude test chat)
        return orderedChats.filter((chat) => {
          if (chat.chatId === TEST_PHONE) return false; // Exclude test chat
          const chatStatus = getChatStatus(chat);
          return chatStatus === 'open' || chatStatus === 'verify-payment';
        });

      case 'blocked':
        // Chats with status "blocked" (exclude test chat)
        return orderedChats.filter((chat) => {
          if (chat.chatId === TEST_PHONE) return false; // Exclude test chat
          const chatStatus = getChatStatus(chat);
          return chatStatus === 'blocked';
        });

      case 'closed':
        // Chats with status "closed" (exclude test chat)
        return orderedChats.filter((chat) => {
          if (chat.chatId === TEST_PHONE) return false; // Exclude test chat
          const chatStatus = getChatStatus(chat);
          return chatStatus === 'closed';
        });

      case 'all':
        // All chats (exclude test chat)
        return orderedChats.filter((chat) => chat.chatId !== TEST_PHONE);

      default:
        return orderedChats;
    }
  }, [chatFilter, orderedChats, currentUserEmail]);

  // Apply ChatsSearch filters (status/assignee) to displayedChats
  // This makes the status/assignee filters work even when not searching
  const displayedChatsFiltered = useMemo(() => {
    return displayedChats.filter((chat) => {
      // Apply status filter
      if (statusFilter !== 'all') {
        // Special handling for "unanswered" filter
        if (statusFilter === 'unanswered') {
          if ((chat.unansweredCount ?? 0) <= 0) return false;
        } else {
          // Regular status filtering
          const chatStatus = getChatStatus(chat);
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
  }, [displayedChats, statusFilter, assigneeFilter]);

  // Filter options for mobile dropdown
  const filterOptions = [
    { value: 'inbox', label: t('Your inbox') },
    { value: 'with-bot', label: t('With bot') },
    { value: 'unassigned', label: t('Unassigned') },
    { value: 'open', label: t('Opened') },
    { value: 'blocked', label: t('Blocked') },
    { value: 'closed', label: t('Closed') },
    { value: 'all', label: t('All') },
  ];

  // Filter search results to only show chats that are in displayedChats (left panel filter)
  const filteredChatsPhoneVisible = useMemo(() => {
    return filteredChatsPhone.filter((chat) => displayedChats.some((dc) => dc.chatId === chat.chatId));
  }, [filteredChatsPhone, displayedChats]);

  const filteredChatsNameVisible = useMemo(() => {
    return filteredChatsName.filter((chat) => displayedChats.some((dc) => dc.chatId === chat.chatId));
  }, [filteredChatsName, displayedChats]);

  const messageMatchesVisible = useMemo(() => {
    return messageMatches.filter((match) => displayedChats.some((dc) => dc.chatId === match.chatId));
  }, [messageMatches, displayedChats]);

  // Check if there are any search results (after filtering by left panel filter)
  const hasSearchResults =
    filteredChatsPhoneVisible.length > 0 ||
    filteredChatsNameVisible.length > 0 ||
    messageMatchesVisible.length > 0;

  return (
    <div
      className={`relative flex flex-col h-full w-full overflow-y-scroll overflow-x-hidden ${activeChat && !isMobile ? 'flex' : activeChat ? 'hidden' : ''}`}
      style={{
        borderRight: 'none',
      }}
    >
      {/* Slot: Before sidebar content - for global actions, settings, filters */}
      <Slot name="sidebar-top" />

      {/* Mobile-only filter select (hidden for agents who have tabs for filtering) */}
      {isMobile && !hideFilterDropdown && (
        <div className="px-4 pb-2 mt-4">
          <Select value={chatFilter} onValueChange={(value) => value && onFilterChange(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('Select filter')} />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Search input */}
      <div className="px-0 pb-2 mt-1">
        <ChatsSearch
          onChange={onSearchChange}
          onClear={onClearSearch}
          onStatusFilterChange={setStatusFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          collaborators={collaborators}
          profilePictures={profilePictures}
        />
      </div>

      {/* Slot: After search - for filters, tabs, action buttons, etc. */}
      <Slot name="chat-list-toolbar" />

      {/* Search results */}
      {isSearchActive && hasSearchResults ? (
        <div ref={chatListScrollRef} className="w-full h-fit pb-9 overflow-y-auto">
          {/* Chats by phone */}
          {filteredChatsPhoneVisible.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                {t('Chats')} ({filteredChatsPhoneVisible.length})
              </div>
              {filteredChatsPhoneVisible.map((chat) => (
                <MessagePreview
                  key={chat.chatId}
                  onClickMsg={(id) => handleChatSelect(id, !chat.read)}
                  lastMessage={chat}
                  phone={chat.chatId}
                  selected={chat.chatId === activeChat}
                  collaborators={collaborators}
                  profilePictures={profilePictures}
                />
              ))}
            </div>
          )}

          {/* Chats by name */}
          {filteredChatsNameVisible.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase mt-2">
                {t('Contacts')} ({filteredChatsNameVisible.length})
              </div>
              {filteredChatsNameVisible.map((chat) => (
                <MessagePreview
                  key={chat.chatId}
                  onClickMsg={(id) => handleChatSelect(id, !chat.read)}
                  lastMessage={chat}
                  phone={chat.chatId}
                  selected={chat.chatId === activeChat}
                  collaborators={collaborators}
                  profilePictures={profilePictures}
                />
              ))}
            </div>
          )}

          {/* Message matches */}
          {messageMatchesVisible.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase mt-2">
                {t('Messages')} ({messageMatchesVisible.length})
              </div>
              {messageMatchesVisible.map((match, idx) => (
                <MessageSearchResult
                  key={`${match.chatId}-${match.message.id}-${idx}`}
                  message={match.message}
                  chatId={match.chatId}
                  chatName={match.chatName}
                  onClickMessage={onMessageResultClick}
                />
              ))}
            </div>
          )}
        </div>
      ) : isSearchActive ? (
        // No search results
        <Alert className="m-4 w-[calc(100%-8*var(--spacing))]">
          <MessageCircleOff />
          <AlertTitle>{t('No results found')}</AlertTitle>
          <AlertDescription>
            {t('No chats or messages match your search· Try a different search term·')}
          </AlertDescription>
        </Alert>
      ) : displayedChatsFiltered.length > 0 ? (
        // All chats
        <div
          ref={chatListScrollRef}
          className="w-full h-fit pb-9 overflow-y-auto"
          onScroll={handleScroll}
        >
          {displayedChatsFiltered.map((chat) => (
            <MessagePreview
              key={chat.chatId}
              onClickMsg={(id) => handleChatSelect(id, !chat.read)}
              lastMessage={chat}
              phone={chat.chatId}
              selected={chat.chatId === activeChat}
              collaborators={collaborators}
              profilePictures={profilePictures}
            />
          ))}
          {/* Loading more indicator */}
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
            </div>
          )}
        </div>
      ) : (
        // Empty state
        <Alert className="cursor-default! m-4 w-[calc(100%-8*var(--spacing))]">
          <MessageCircleOff />
          <AlertTitle>{t("You don't have chats yet")}</AlertTitle>
          <AlertDescription>
            <div className="cursor-default!">
              {t('Send yourself a message, or try to send one to a customer!')}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Slot: After chat list - for stats, footer, actions */}
      <Slot name="sidebar-bottom" />
    </div>
  );
};

// Memoize to prevent re-renders when chat list hasn't changed
export const ChatListPanel = memo(ChatListPanelComponent);

ChatListPanel.displayName = 'ChatListPanel';
