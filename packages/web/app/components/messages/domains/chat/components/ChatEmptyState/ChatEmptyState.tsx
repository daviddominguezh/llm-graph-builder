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
    <div className="h-full flex-1 flex items-center justify-center bg-[#f8f9fa] border-l">
      <div className="text-center p-8">
        <MessageCircleOff className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="cursor-default text-lg font-semibold text-gray-700 mt-1">
          {t('No chat selected')}
        </h3>
        <p className="cursor-default text-gray-500">
          {t('Select a conversation from the list to start messaging')}
        </p>
      </div>
    </div>
  );
};

ChatEmptyState.displayName = 'ChatEmptyState';
