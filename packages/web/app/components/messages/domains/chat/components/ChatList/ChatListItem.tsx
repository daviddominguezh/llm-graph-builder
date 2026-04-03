import React, { memo, useCallback, useMemo } from 'react';
import Avatar from 'react-nice-avatar';
import { Badge } from '@/components/ui/badge';
import { WhatsAppIcon } from '@/app/components/messages/shared/icons';
import { generateAvatarConfig } from '@/app/utils/avatar';
import { formatTimestamp, parseChatId, ChatSource } from '@/app/utils/strs';
import { getMessageText } from '@/app/utils/message';
import { LastMessage } from '@/app/types/chat';
import { FlaskConical, Instagram } from 'lucide-react';
import { TEST_PHONE } from '@/app/constants/messages';
import styles from './ChatListItem.module.css';

/**
 * Individual chat item in the list
 * Displays conversation preview with avatar, name, last message, and status
 */
interface ChatListItemProps {
  chat: LastMessage;
  isActive: boolean;
  isTestChat?: boolean;
  onClick: (id: string) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
  className?: string;
}

export const ChatListItem: React.FC<ChatListItemProps> = memo(({
  chat,
  isActive,
  isTestChat = false,
  onClick,
  onDelete,
  showActions = false,
  className = '',
}) => {
  // Get chatId from key field
  const chatId = chat.key ?? '';

  const handleClick = useCallback(() => {
    onClick(chatId);
  }, [onClick, chatId]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(chatId);
  }, [onDelete, chatId]);

  // Parse chat ID to get source and display name
  const parsedChat = useMemo(() => {
    return parseChatId(chatId);
  }, [chatId]);

  // Determine display name
  const displayName = useMemo(() => {
    if (isTestChat || chatId === TEST_PHONE) {
      return 'Test Chat';
    }
    return chat.name || parsedChat.displayName;
  }, [chat.name, chatId, isTestChat, parsedChat.displayName]);

  // Avatar configuration
  const avatarConfig = useMemo(() => {
    const identifier = (isTestChat || chatId === TEST_PHONE) ? TEST_PHONE : chatId;
    return generateAvatarConfig(identifier);
  }, [chatId, isTestChat]);

  // Format message preview
  const messagePreview = useMemo(() => {
    const text = getMessageText(chat.message);
    const maxLength = 50;

    if (!text) return 'No messages yet';

    if (text.length > maxLength) {
      return `${text.substring(0, maxLength)}...`;
    }
    return text;
  }, [chat.message]);

  // Format timestamp
  const formattedTime = useMemo(() => {
    return formatTimestamp(chat.timestamp);
  }, [chat.timestamp]);

  // Render platform badge icon
  const renderPlatformBadge = (source: ChatSource) => {
    if (source === 'whatsapp') {
      return (
        <div className={styles.platformBadge}>
          <WhatsAppIcon size={12} className="text-[#25D366]" />
        </div>
      );
    }
    if (source === 'instagram') {
      return (
        <div className={styles.platformBadge}>
          <Instagram size={12} className="text-[#E4405F]" />
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`${styles.chatItem} ${isActive ? styles.active : ''} ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Chat with ${displayName}`}
      aria-pressed={isActive}
    >
      <div className={styles.avatarContainer}>
        <Avatar
          className={styles.avatar}
          {...avatarConfig}
          style={{ width: '48px', height: '48px' }}
        />
        {isTestChat && (
          <div className={styles.testBadge}>
            <FlaskConical size={16} />
          </div>
        )}
        {!isTestChat && renderPlatformBadge(parsedChat.source)}
        {!chat.read && (
          <div className={styles.unreadDot} aria-label="Unread messages" />
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.name}>
            {displayName}
            {chat.status === 'boss' && (
              <Badge variant="destructive" className={styles.inquiryBadge}>
                Inquiry
              </Badge>
            )}
          </h3>
          <span className={styles.timestamp}>{formattedTime}</span>
        </div>

        <div className={styles.preview}>
          <p className={`${styles.message} ${!chat.read ? styles.unread : ''}`}>
            {messagePreview}
          </p>
          {!chat.enabled && (
            <Badge variant="secondary" className={styles.disabledBadge}>
              AI Off
            </Badge>
          )}
        </div>
      </div>

      {showActions && (
        <div className={styles.actions}>
          <button
            onClick={handleDelete}
            className={styles.deleteButton}
            aria-label="Delete conversation"
          >
            <span>×</span>
          </button>
        </div>
      )}
    </div>
  );
});

ChatListItem.displayName = 'ChatListItem';
