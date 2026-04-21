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
    <div className="h-full flex-1 flex items-center justify-center bg-background border-l px-8">
      <div className="flex w-full flex-col items-center gap-0 rounded-md  border-dashed bg-background px-4 py-8 text-center">
        <MessageCircleOff className="size-6 text-muted-foreground/50" />
        <p className="text-sm font-medium mt-2">{t('No chat selected')}</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {t('Select a conversation from the list to start messaging')}
        </p>
      </div>
    </div>
  );
};

ChatEmptyState.displayName = 'ChatEmptyState';
