
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import { TEST_PHONE } from '@/app/constants/messages';
import { LAST_MESSAGES_SCROLL_THRESHOLD } from '@/app/constants/lastMessages';

import { AI_MESSAGE_ROLES, INTENT, LastMessage } from '@/app/types/chat';

import { ChatFilters } from '../../../../MessagesDashboard.types';
import styles from './ChatList.module.css';
import { ChatListEmpty } from './ChatListEmpty';
import { ChatListHeader } from './ChatListHeader';
import { ChatListItem } from './ChatListItem';
import { ChatListSkeleton } from './ChatListSkeleton';
import { ChatListItemSkeleton } from './ChatListItemSkeleton';

/**
 * Chat list component with virtualization support
 * Displays a list of conversations with filtering and grouping
 */
interface ChatListProps {
  conversations: LastMessage[];
  activeId: string | null;
  onChatSelect: (id: string) => void;
  filters?: ChatFilters;
  groupBy?: 'date' | 'status' | 'assignee' | 'none';
  onDeleteChat?: (id: string) => void;
  isSearchActive?: boolean;
  showTestChat?: boolean;
  onFilterChange?: (filters: ChatFilters) => void;
  className?: string;
  /** Callback to load more conversations (pagination) */
  onLoadMore?: () => void;
  /** Whether there are more conversations to load */
  hasMore?: boolean;
  /** Whether more conversations are currently being loaded */
  isLoadingMore?: boolean;
  /** Whether initial conversations are being loaded */
  isLoading?: boolean;
}

export const ChatList: React.FC<ChatListProps> = memo(
  ({
    conversations,
    activeId,
    onChatSelect,
    filters,
    groupBy = 'none',
    onDeleteChat,
    isSearchActive = false,
    showTestChat = false,
    onFilterChange,
    className = '',
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
    isLoading = false,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const enableVirtualization = true;
    const itemHeight = 80; // Estimated height of each chat item
    const isLoadingMoreRef = useRef(false);

    // Track loading state to prevent duplicate calls
    useEffect(() => {
      isLoadingMoreRef.current = isLoadingMore;
    }, [isLoadingMore]);

    /**
     * Handle scroll for infinite loading
     */
    const handleScroll = useCallback(() => {
      if (!onLoadMore || !hasMore || isLoadingMoreRef.current) return;

      const container = containerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrollPercentage > LAST_MESSAGES_SCROLL_THRESHOLD) {
        onLoadMore();
      }
    }, [onLoadMore, hasMore]);

    // Filter conversations
    const filteredConversations = useMemo(() => {
      let filtered = [...conversations];

      // Apply filters
      if (filters) {
        if (filters.status === 'unread') {
          filtered = filtered.filter((chat) => !chat.read);
        } else if (filters.status === 'archived') {
          // TODO: Implement archived logic when archive feature is added
          // filtered = filtered.filter(chat => chat.archived);
        }

        if (filters.assignee) {
          // TODO: Implement assignee filtering when assignee field is added to LastMessage type
          // This will filter conversations by assigned team member
        }

        if (filters.tags && filters.tags.length > 0) {
          // Implement tag filtering
        }

        if (filters.dateRange) {
          const [start, end] = filters.dateRange;
          filtered = filtered.filter((chat) => {
            const date = new Date(chat.timestamp);
            return date >= start && date <= end;
          });
        }
      }

      // Add test chat if enabled
      if (showTestChat) {
        const testChat: LastMessage = {
          key: TEST_PHONE,
          originalId: '',
          name: 'Test Chat',
          timestamp: Date.now(),
          read: true,
          enabled: true,
          type: 'text',
          intent: INTENT.NONE,
          id: TEST_PHONE,
          message: {
            role: AI_MESSAGE_ROLES.ASSISTANT,
            content: '',
          },
        };

        // Add test chat at the beginning
        filtered.unshift(testChat);
      }

      return filtered;
    }, [conversations, filters, showTestChat]);

    // Group conversations
    const groupedConversations = useMemo(() => {
      if (groupBy === 'none') {
        return [{ label: null, items: filteredConversations }];
      }

      const groups = new Map<string, LastMessage[]>();

      filteredConversations.forEach((chat) => {
        let groupKey = '';

        switch (groupBy) {
          case 'date':
            groupKey = getDateGroup(chat.timestamp);
            break;
          case 'status':
            groupKey = getStatusGroup(chat);
            break;
          case 'assignee':
            // TODO: Add assignee field to LastMessage type when implementing team features
            groupKey = 'Unassigned';
            break;
        }

        const group = groups.get(groupKey);
        if (group) {
          group.push(chat);
        } else {
          groups.set(groupKey, [chat]);
        }
      });

      return Array.from(groups.entries()).map(([label, items]) => ({
        label,
        items,
      }));
    }, [filteredConversations, groupBy]);

    // Flatten conversations for virtualization
    const flatItems = useMemo(() => {
      const items: Array<{ type: 'header' | 'chat'; data: string | LastMessage }> = [];

      groupedConversations.forEach((group) => {
        if (group.label) {
          items.push({ type: 'header', data: group.label });
        }
        group.items.forEach((chat) => {
          items.push({ type: 'chat', data: chat });
        });
      });

      return items;
    }, [groupedConversations]);

    // Virtualization setup
    // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer returns unmemoizable functions (React Compiler limitation)
    const virtualizer = useVirtualizer({
      count: enableVirtualization ? flatItems.length : 0,
      getScrollElement: () => containerRef.current,
      estimateSize: useCallback(
        (index: number) => {
          return flatItems[index].type === 'header' ? 30 : itemHeight;
        },
        [flatItems, itemHeight]
      ),
      overscan: 5,
    });

    // Show skeleton during initial load
    if (isLoading) {
      return (
        <div className={`${styles.container} ${className}`}>
          <ChatListHeader
            totalCount={0}
            filteredCount={0}
            onFilterChange={onFilterChange}
          />
          <div className={styles.scrollContainer}>
            <ChatListSkeleton />
          </div>
        </div>
      );
    }

    // Handle empty state
    if (filteredConversations.length === 0) {
      return (
        <div className={`${styles.container} ${className}`}>
          <ChatListHeader
            totalCount={conversations.length}
            filteredCount={0}
            onFilterChange={onFilterChange}
          />
          <ChatListEmpty
            hasFilters={!!filters && Object.keys(filters).length > 0}
            isSearchActive={isSearchActive}
          />
        </div>
      );
    }

    // Render virtualized list for large datasets
    if (enableVirtualization && flatItems.length > 20) {
      return (
        <div className={`${styles.container} ${className}`}>
          <ChatListHeader
            totalCount={conversations.length}
            filteredCount={filteredConversations.length}
            onFilterChange={onFilterChange}
          />
          <div
            ref={containerRef}
            className={styles.scrollContainer}
            onScroll={handleScroll}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = flatItems[virtualItem.index];

                if (item.type === 'header') {
                  return (
                    <div
                      key={virtualItem.key}
                      className={styles.groupHeader}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {item.data as string}
                    </div>
                  );
                }

                const chat = item.data as LastMessage;
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <ChatListItem
                      chat={chat}
                      isActive={(chat.key ?? '') === activeId}
                      isTestChat={(chat.key ?? '') === TEST_PHONE}
                      onClick={onChatSelect}
                      onDelete={onDeleteChat}
                      showActions={!!onDeleteChat}
                    />
                  </div>
                );
              })}
            </div>
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="py-2">
                <ChatListItemSkeleton />
                <ChatListItemSkeleton />
              </div>
            )}
          </div>
        </div>
      );
    }

    // Render regular list for small datasets
    return (
      <div className={`${styles.container} ${className}`}>
        <ChatListHeader
          totalCount={conversations.length}
          filteredCount={filteredConversations.length}
          onFilterChange={onFilterChange}
        />
        <div
          ref={containerRef}
          className={styles.scrollContainer}
          onScroll={handleScroll}
        >
          {groupedConversations.map((group, groupIndex) => (
            <div key={groupIndex} className={styles.group}>
              {group.label && <div className={styles.groupHeader}>{group.label}</div>}
              {group.items.map((chat) => (
                <ChatListItem
                  key={chat.key ?? ''}
                  chat={chat}
                  isActive={(chat.key ?? '') === activeId}
                  isTestChat={(chat.key ?? '') === TEST_PHONE}
                  onClick={onChatSelect}
                  onDelete={onDeleteChat}
                  showActions={!!onDeleteChat}
                />
              ))}
            </div>
          ))}
          {/* Loading more indicator */}
          {isLoadingMore && (
            <div className="py-2">
              <ChatListItemSkeleton />
              <ChatListItemSkeleton />
            </div>
          )}
        </div>
      </div>
    );
  }
);

ChatList.displayName = 'ChatList';

/**
 * Helper functions for grouping
 */
function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'This Week';
  if (days <= 30) return 'This Month';
  return 'Older';
}

function getStatusGroup(chat: LastMessage): string {
  if (chat.status === 'boss') return 'Requires Attention';
  if (!chat.read) return 'Unread';
  if (!chat.enabled) return 'AI Disabled';
  return 'Active';
}
