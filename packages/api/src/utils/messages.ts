import type { ModelMessage } from 'ai';

import { FIRST_INDEX } from '@src/constants/index.js';
import type { Message } from '@src/types/ai/index.js';

export const formatMessages = (messages: Message[], systemPrompt: string[]): ModelMessage[] => {
  const cleanMessages = messages.map((msg) => msg.message);
  if (systemPrompt.length === FIRST_INDEX) return [...cleanMessages];
  return [...systemPrompt.map((p) => ({ role: 'system' as const, content: p })), ...cleanMessages];
};

export const getOnlyChatMessages = (messages: ModelMessage[]): ModelMessage[] =>
  messages.filter((msg) => msg.role === 'user' || msg.role === 'assistant');
