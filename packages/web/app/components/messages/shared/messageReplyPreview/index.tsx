import React from 'react';
import { useTranslations } from 'next-intl';

import { Image } from 'lucide-react';

import { getMessageText } from '@/app/utils/message';
import { formatWhatsapp } from '@/app/utils/strs';

import { AI_MESSAGE_ROLES, Message } from '@/app/types/chat';

import styles from './index.module.css';

import PDFImg from '@/app/components/messages/shared/assets';

interface MessageReplyPreviewProps {
  repliedMessage: Message | null;
  onClick: (messageId: string) => void;
  isUserMessage: boolean;
}

export const MessageReplyPreview: React.FC<MessageReplyPreviewProps> = ({
  repliedMessage,
  onClick,
  isUserMessage,
}) => {
  const t = useTranslations('messages');

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (repliedMessage) {
      onClick(repliedMessage.id);
    }
  };

  const getSenderLabel = (message: Message | null): string => {
    if (!message) return '';
    return message.message.role === AI_MESSAGE_ROLES.USER ? t('User') : t('Agent');
  };

  const getMessagePreview = (message: Message | null): string => {
    if (!message) return t('Original message');

    // Handle media messages
    if (message.type === 'image') {
      const text = getMessageText(message.message);
      return text ? formatWhatsapp(text) : 'Photo';
    }
    if (message.type === 'pdf') {
      const text = getMessageText(message.message);
      return text ? formatWhatsapp(text) : 'Document';
    }
    if (message.type === 'video') {
      return 'Video';
    }
    if (message.type === 'audio') {
      return 'Audio';
    }

    // Text message - apply WhatsApp formatting
    const text = getMessageText(message.message) || 'Message';
    return formatWhatsapp(text);
  };

  const renderMediaPreview = () => {
    if (!repliedMessage || !repliedMessage.mediaUrl) return null;

    if (repliedMessage.type === 'image') {
      return (
        <img
          src={repliedMessage.mediaUrl}
          alt="Preview"
          className={styles['media-thumbnail']}
          onError={(e) => {
            // Fallback to icon if image fails to load
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    }

    if (repliedMessage.type === 'pdf') {
      return <img src={PDFImg} alt="PDF" className={styles['media-thumbnail']} />;
    }

    if (repliedMessage.type === 'video' || repliedMessage.type === 'audio') {
      return (
        <div className={styles['media-thumbnail']}>
          <Image size={20} className={styles['media-icon']} />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`${styles['reply-preview']} ${isUserMessage ? styles['reply-preview-user'] : styles['reply-preview-assistant']}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as unknown as React.MouseEvent);
        }
      }}
      aria-label={`Reply to ${getSenderLabel(repliedMessage)}: ${getMessagePreview(repliedMessage)}`}
    >
      <div className={styles['reply-border']}></div>
      <div className={styles['reply-content']}>
        {renderMediaPreview()}
        <div className={styles['reply-text-container']}>
          <div className={styles['reply-sender']}>{getSenderLabel(repliedMessage)}</div>
          <div
            className={styles['reply-text']}
            dangerouslySetInnerHTML={{ __html: getMessagePreview(repliedMessage) }}
          ></div>
        </div>
      </div>
    </div>
  );
};
