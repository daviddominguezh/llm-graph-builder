import { AI_MESSAGE_ROLES, INTENT, type Message } from '@/app/types/chat';

const INITIAL_CHAT: Message[] = [
  {
    id: '1',
    intent: INTENT.NONE,
    type: 'text',
    originalId: '',
    message: {
      role: AI_MESSAGE_ROLES.ASSISTANT,
      content: "Hello there! 👋 It's nice to meet you!",
    },
    timestamp: Date.now(),
  },
  {
    id: '2',
    intent: INTENT.NONE,
    type: 'text',
    originalId: '',
    message: {
      role: AI_MESSAGE_ROLES.ASSISTANT,
      content: 'What brings you here today? Please let me know how I can help 🪄',
    },
    timestamp: Date.now(),
  },
];

export const getInitialChatData = () => {
  INITIAL_CHAT.forEach((message) => (message.timestamp = Date.now()));
  return INITIAL_CHAT;
};
