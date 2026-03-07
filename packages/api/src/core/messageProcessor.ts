import type { AssistantModelMessage, ModelMessage, ToolModelMessage } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import type { Message } from '@src/types/messages/aiMessages.js';
import type { MESSAGES_PROVIDER } from '@src/types/messages/closerMessages.js';

const EMPTY_LENGTH = 0;

interface ParsedJSONWithNode {
  nextNodeID: unknown;
  messageToUser?: unknown;
}

const isValidParsedMessage = (data: unknown): data is ParsedJSONWithNode =>
  typeof data === 'object' && data !== null && 'nextNodeID' in data;

/**
 * Creates a deep copy of messages to prevent mutation
 * Uses structuredClone for type-safe deep cloning
 */
export const cloneMessages = <T extends Message[] | ModelMessage[]>(messages: T): T =>
  structuredClone(messages);

/**
 * Extracts content from messages by type (text or reasoning)
 */
export const extractContentByType = (
  msgs: Array<AssistantModelMessage | ToolModelMessage>,
  type: 'text' | 'reasoning'
): string[] => {
  const results: string[] = [];

  msgs.forEach((msg) => {
    if (msg.role !== 'assistant') {
      return;
    }

    const { content: msgContent } = msg;
    if (typeof msgContent === 'string') {
      results.push(msgContent);
      return;
    }

    const parts = msgContent
      .filter((part) => part.type === type)
      .map((part) => ('text' in part ? part.text : ''));
    results.push(...parts);
  });

  return results;
};

/**
 * Attempts to parse and extract messageToUser from JSON content
 */
const getMessageToUserFromParsed = (parsedJSON: ParsedJSONWithNode): string | undefined => {
  if ('messageToUser' in parsedJSON && typeof parsedJSON.messageToUser === 'string') {
    return parsedJSON.messageToUser;
  }
  return undefined;
};

const extractUserMessage = (text: string): string | undefined => {
  try {
    const parsedJSON: unknown = JSON.parse(text);
    if (isValidParsedMessage(parsedJSON)) {
      return getMessageToUserFromParsed(parsedJSON);
    }
  } catch {
    // Not valid JSON, return original text
  }
  return text;
};

/**
 * Cleans message content by extracting user-facing text from JSON responses
 */
const cleanMessageContent = (
  content: NonNullable<AssistantModelMessage['content']>
): NonNullable<AssistantModelMessage['content']> | null => {
  if (typeof content === 'string') {
    return content;
  }

  const newParts = content
    .map((part) => {
      if (part.type !== 'text') {
        return part;
      }

      const text = extractUserMessage(part.text);
      if (text === undefined || text === '') {
        return null;
      }

      return { ...part, text };
    })
    .filter((part): part is NonNullable<typeof part> => part !== null);

  return newParts.length === EMPTY_LENGTH ? null : newParts;
};

/**
 * Removes empty messages and cleans assistant message content
 */
export const cleanEmptyMessages = (msgs: Message[]): Message[] =>
  msgs
    .map((mMsg) => {
      const { message: msg } = mMsg;
      if (msg.role !== 'assistant') {
        return mMsg;
      }

      const cleanedContent = cleanMessageContent(msg.content);
      if (cleanedContent === null) {
        return null;
      }

      return { ...mMsg, message: { ...msg, content: cleanedContent } };
    })
    .filter((msg): msg is Message => msg !== null);

/**
 * Prepares messages for sending by removing reasoning and cleaning content
 */
export const cleanMessagesBeforeSending = (msgs: ModelMessage[]): ModelMessage[] => {
  const cleanedMsgs = cloneMessages(msgs);

  // Remove reasoning parts - create new array with filtered content
  const msgsWithoutReasoning = cleanedMsgs.map((msg) => {
    if (msg.role !== 'assistant') {
      return msg;
    }
    if (typeof msg.content === 'string') {
      return msg;
    }
    return { ...msg, content: msg.content.filter((part) => part.type !== 'reasoning') };
  });

  // Clean and filter messages
  return msgsWithoutReasoning
    .map((msg) => {
      if (msg.role !== 'assistant') {
        return msg;
      }

      const cleanedContent = cleanMessageContent(msg.content);
      if (cleanedContent === null) {
        return null;
      }

      return { ...msg, content: cleanedContent };
    })
    .filter((msg): msg is ModelMessage => msg !== null);
};

/**
 * Converts model messages to application Message format
 */
export const convertToAppMessages = (
  msgs: Array<AssistantModelMessage | ToolModelMessage>,
  provider: MESSAGES_PROVIDER
): Message[] =>
  msgs.map((msg) => ({
    provider,
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'text',
    originalId: uuidv4(),
    message: msg,
  }));

/**
 * Checks if a message is an assistant message with only text content.
 * These should NOT be saved in intermediate steps as they go through tone adaptation later.
 */
export const isAssistantTextMessage = (msg: Message): boolean => {
  const { message } = msg;
  if (message.role !== 'assistant') return false;

  // String content = text message
  if (typeof message.content === 'string') return true;

  // Array content - check if it only contains text/reasoning parts (no tool calls)
  if (Array.isArray(message.content)) {
    const hasToolCall = message.content.some((part) => part.type === 'tool-call');
    return !hasToolCall;
  }

  return false;
};

// Export class-like namespace for backward compatibility
export const MessageProcessor = {
  cloneMessages,
  extractContentByType,
  cleanEmptyMessages,
  cleanMessagesBeforeSending,
  convertToAppMessages,
  isAssistantTextMessage,
};
