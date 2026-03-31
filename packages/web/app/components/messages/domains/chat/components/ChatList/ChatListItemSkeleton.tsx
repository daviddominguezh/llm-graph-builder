import React from 'react';
import styles from './ChatListItem.module.css';

/**
 * Skeleton placeholder for ChatListItem
 * Matches the 80px height structure with pulse animation
 */
export const ChatListItemSkeleton: React.FC = () => {
  return (
    <div className={`${styles.chatItem} animate-pulse`} aria-hidden="true">
      {/* Avatar skeleton */}
      <div className={styles.avatarContainer}>
        <div
          className="rounded-full bg-gray-200"
          style={{ width: '48px', height: '48px' }}
        />
      </div>

      {/* Content skeleton */}
      <div className={styles.content}>
        {/* Header row: name + timestamp */}
        <div className={styles.header}>
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-200 rounded w-12" />
        </div>

        {/* Preview row: message */}
        <div className={styles.preview}>
          <div className="h-3 bg-gray-200 rounded w-48" />
        </div>
      </div>
    </div>
  );
};

ChatListItemSkeleton.displayName = 'ChatListItemSkeleton';
