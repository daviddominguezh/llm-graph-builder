import React from 'react';
import { ChatListItemSkeleton } from './ChatListItemSkeleton';

const SKELETON_COUNT = 10;

/**
 * Skeleton list for ChatList loading state
 * Renders multiple ChatListItemSkeleton components
 */
export const ChatListSkeleton: React.FC = () => {
  return (
    <div aria-label="Loading conversations" role="status">
      {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <ChatListItemSkeleton key={index} />
      ))}
    </div>
  );
};

ChatListSkeleton.displayName = 'ChatListSkeleton';
