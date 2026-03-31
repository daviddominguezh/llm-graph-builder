import React, { useMemo } from 'react';
import Avatar from 'react-nice-avatar';

import { CheckCheck } from 'lucide-react';

import { generateAvatarConfig } from '@globalUtils/avatar';
import { getMessageText } from '@globalUtils/message';
import { formatPhone, formatTimestamp, getNameFromLastMessage } from '@globalUtils/strs';

import { TEST_PHONE } from '@constants/messages';

import { Message } from '@globalTypes/chat';

interface MessageSearchResultProps {
  message: Message;
  chatId: string;
  chatName?: string;
  onClickMessage: (chatId: string, messageId: string) => void;
}

export const MessageSearchResult: React.FC<MessageSearchResultProps> = ({
  message,
  chatId,
  chatName,
  onClickMessage,
}) => {
  const isTest = chatId === TEST_PHONE;
  const phone = chatId.replace('whatsapp:', '');
  const formattedPhone = formatPhone(phone) || phone;
  const displayName = isTest ? 'Closer' : getNameFromLastMessage(chatName || '', formattedPhone);
  const messageText = getMessageText(message.message) || '';

  // For Closer (test chat): show checkmark when role is 'user' (our messages)
  // For regular chats: show checkmark when role is NOT 'user' (our messages sent as assistant)
  const showCheckmark = isTest ? message.message.role === 'user' : message.message.role !== 'user';

  // Generate avatar config using chatId (includes whatsapp: prefix) as seed
  const avatarConfig = useMemo(() => {
    return chatId ? generateAvatarConfig(chatId) : generateAvatarConfig('');
  }, [chatId]);

  return (
    <div
      className="px-5 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100"
      onClick={() => onClickMessage(chatId, message.id)}
    >
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10 shrink-0" {...avatarConfig} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold truncate">{displayName}</span>
            {!isTest && <span className="text-xs text-gray-500 shrink-0">{formattedPhone}</span>}
            <span className="text-xs text-gray-500 shrink-0 ml-auto">
              {formatTimestamp(message.timestamp, true)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {showCheckmark && <CheckCheck style={{ flexShrink: 0 }} size={14} />}
            <div className="text-sm text-gray-600 truncate overflow-hidden whitespace-nowrap">
              {messageText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
