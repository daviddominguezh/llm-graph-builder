import type { ModelMessage } from 'ai';

const isValidJson = (input: string): boolean => {
  if (typeof input !== 'string') return false;
  try {
    JSON.parse(input);
    return true; // primitives like "123" or "true" are valid JSON too
  } catch {
    return false;
  }
};

export const getMessageText = (message: ModelMessage): string | null => {
  if (!message) return null;
  if (message.role === 'tool') return null;
  if (!message.content || message.content.length === 0) return null;

  let str: string;
  if (typeof message.content === 'string') str = message.content.trim();
  else {
    let text = '';
    message.content.forEach((part) => {
      if (part.type === 'text') {
        // Filter out reference image descriptions for user messages with media
        const partText = part.text || '';
        if (
          !partText.startsWith('The user sent you a reference image') &&
          !partText.startsWith('The user sent an image')
        ) {
          text += `\n${partText}`;
        }
      }
    });
    str = text.trim();
  }

  if (!isValidJson(str)) return str;

  const { messageToUser } = JSON.parse(str) || {};
  if (!messageToUser || messageToUser.length === 0) return str;
  return messageToUser;
};
