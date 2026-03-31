import React from 'react';
import { MessageCircleOff, Search, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import styles from './ChatListEmpty.module.css';

/**
 * Empty state component for chat list
 * Shows appropriate message based on context
 */
interface ChatListEmptyProps {
  hasFilters?: boolean;
  isSearchActive?: boolean;
  onClearFilters?: () => void;
  onStartChat?: () => void;
}

export const ChatListEmpty: React.FC<ChatListEmptyProps> = ({
  hasFilters = false,
  isSearchActive = false,
  onClearFilters,
  onStartChat,
}) => {
  const t = useTranslations('messages');

  // Search empty state
  if (isSearchActive) {
    return (
      <div className={styles.container}>
        <div className={styles.iconContainer}>
          <Search className={styles.icon} size={48} />
        </div>
        <h3 className={styles.title}>{t('No search results')}</h3>
        <p className={styles.description}>
          {t('Try adjusting your search terms or filters')}
        </p>
        {hasFilters && onClearFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            className={styles.action}
          >
            {t('Clear filters')}
          </Button>
        )}
      </div>
    );
  }

  // Filtered empty state
  if (hasFilters) {
    return (
      <div className={styles.container}>
        <div className={styles.iconContainer}>
          <Filter className={styles.icon} size={48} />
        </div>
        <h3 className={styles.title}>{t('No conversations match filters')}</h3>
        <p className={styles.description}>
          {t('Try adjusting your filters to see more conversations')}
        </p>
        {onClearFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            className={styles.action}
          >
            {t('Clear filters')}
          </Button>
        )}
      </div>
    );
  }

  // Default empty state
  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <MessageCircleOff className={styles.icon} size={48} />
      </div>
      <h3 className={styles.title}>{t('No conversations yet')}</h3>
      <p className={styles.description}>
        {t('When customers message you, their conversations will appear here')}
      </p>
      {onStartChat && (
        <Button
          variant="default"
          onClick={onStartChat}
          className={styles.action}
        >
          {t('Start test conversation')}
        </Button>
      )}
      <div className={styles.tips}>
        <h4 className={styles.tipsTitle}>{t('Getting started')}</h4>
        <ul className={styles.tipsList}>
          <li>{t('Share your WhatsApp Business number with customers')}</li>
          <li>{t('Enable the AI assistant to handle common inquiries')}</li>
          <li>{t('Customize automated responses for better engagement')}</li>
        </ul>
      </div>
    </div>
  );
};

ChatListEmpty.displayName = 'ChatListEmpty';