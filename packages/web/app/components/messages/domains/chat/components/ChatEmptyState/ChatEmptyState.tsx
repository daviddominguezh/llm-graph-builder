import React from 'react';
import { useTranslations } from 'next-intl';

import { MessageCircleOff } from 'lucide-react';

/**
 * ChatEmptyState component displays when no chat is selected
 * Shows a friendly message prompting user to select a conversation
 */
export const ChatEmptyState: React.FC = () => {
  const t = useTranslations('messages');

  return (
    <div className="h-full flex-1 flex items-center justify-center bg-card border-l">
      <div className="text-center p-8">
        <MessageCircleOff className="w-8 h-8 mx-auto mb-4 text-foreground" />
        <h3 className="cursor-default text-lg font-semibold mt-1">
          {t('No chat selected')}
        </h3>
        <p className="cursor-default text-muted-foreground">
          {t('Select a conversation from the list to start messaging')}
        </p>
      </div>
    </div>
  );
};

ChatEmptyState.displayName = 'ChatEmptyState';
