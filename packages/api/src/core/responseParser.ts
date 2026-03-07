import type { AssistantContent, AssistantModelMessage, ToolModelMessage } from 'ai';

import { logger } from '@src/utils/logger.js';

import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/ai/tools.js';

import { AGENT_CONSTANTS, ERROR_MESSAGES } from './constants.js';
import type { TextExtractionParams } from './types.js';

const EMPTY_LENGTH = 0;
const NOT_FOUND_INDEX = -1;

/**
 * Checks if a string contains think tags
 */
const hasThinkTags = (str: string): boolean =>
  str.length > EMPTY_LENGTH && str.includes(AGENT_CONSTANTS.THINK_TAG_PREFIX);

/**
 * Checks if a string contains JSON markdown
 */
const hasJSONMarkdown = (str: string): boolean =>
  str.length > EMPTY_LENGTH && str.includes(AGENT_CONSTANTS.JSON_MARKDOWN_PREFIX);

/**
 * Creates updated content from think and text parts
 */
const createUpdatedContent = (thinkPart: string, textPart: string): AssistantContent | null => {
  const newContent: AssistantContent = [];
  if (thinkPart.length > EMPTY_LENGTH) {
    newContent.push({ type: 'reasoning', text: thinkPart });
  }
  if (textPart.length > EMPTY_LENGTH) {
    newContent.push({ type: 'text', text: textPart });
  }
  return newContent.length > EMPTY_LENGTH ? newContent : null;
};

/**
 * Creates a new message with updated content
 */
const createMessageWithContent = (
  msg: AssistantModelMessage,
  newContent: AssistantContent
): AssistantModelMessage => ({
  ...msg,
  content: newContent,
});

/**
 * Extracts reasoning and text content from think tags
 */
export const parseThinkTags = (
  msg: AssistantModelMessage | ToolModelMessage,
  extractedText: string
): TextExtractionParams => {
  if (msg.role === 'tool') {
    return { message: msg, text: extractedText };
  }

  if (!hasThinkTags(extractedText)) {
    return { message: msg, text: extractedText };
  }

  const { THINK_TAG_PREFIX, THINK_TAG_SUFFIX } = AGENT_CONSTANTS;
  const thinkIndex = extractedText.indexOf(THINK_TAG_PREFIX);
  if (thinkIndex === NOT_FOUND_INDEX) {
    return { message: msg, text: extractedText };
  }

  const thinkPartEndIndex = extractedText.indexOf(THINK_TAG_SUFFIX);
  const thinkPart = extractedText.substring(thinkIndex + THINK_TAG_PREFIX.length, thinkPartEndIndex).trim();
  const textPart = extractedText.substring(thinkPartEndIndex + THINK_TAG_SUFFIX.length).trim();

  const newContent = createUpdatedContent(thinkPart, textPart);
  if (newContent !== null) {
    const updatedMessage = createMessageWithContent(msg, newContent);
    return { message: updatedMessage, text: textPart.length > EMPTY_LENGTH ? textPart : extractedText };
  }

  return { message: msg, text: extractedText };
};

/**
 * Removes JSON markdown formatting from text
 */
export const parseJSONMarkdown = (
  msg: AssistantModelMessage | ToolModelMessage,
  extractedText: string
): TextExtractionParams => {
  if (msg.role === 'tool') {
    return { message: msg, text: extractedText };
  }

  if (!hasJSONMarkdown(extractedText)) {
    return { message: msg, text: extractedText };
  }

  const { JSON_MARKDOWN_PREFIX, JSON_MARKDOWN_SUFFIX } = AGENT_CONSTANTS;
  const result = extractedText.replaceAll(JSON_MARKDOWN_PREFIX, '').replaceAll(JSON_MARKDOWN_SUFFIX, '');

  return { message: msg, text: result };
};

interface ParsedData {
  nextNodeID: unknown;
  messageToUser?: unknown;
}

const isValidParsedData = (data: unknown): data is ParsedData =>
  typeof data === 'object' && data !== null && 'nextNodeID' in data;

const extractParsedResult = (data: ParsedData): ParsedResult => {
  const messageToUser =
    data.messageToUser === undefined
      ? undefined
      : typeof data.messageToUser === 'string'
        ? data.messageToUser
        : undefined;
  return {
    nextNodeID: String(data.nextNodeID),
    messageToUser,
  };
};

const tryParseJSON = (str: string): ParsedResult | null => {
  try {
    const data: unknown = JSON.parse(str);
    if (isValidParsedData(data)) {
      return extractParsedResult(data);
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Attempts to parse JSON response from model
 * Tries main response first, then falls back to reasoning if provided
 */
export const parseResponseJSON = (context: Context, str: string, reasoningStr?: string): ParsedResult => {
  const errorStr = ERROR_MESSAGES.JSON_PARSE_ERROR(str);
  const newError = new Error(errorStr);

  // Try parsing main response
  const mainResult = tryParseJSON(str);
  if (mainResult !== null) {
    return mainResult;
  }

  // Try parsing reasoning as fallback
  if (reasoningStr !== undefined && reasoningStr !== '') {
    const reasoningResult = tryParseJSON(reasoningStr);
    if (reasoningResult !== null) {
      return reasoningResult;
    }
  }

  // Log error and throw
  logger.error(`callAgentStep/${context.namespace}/${context.userID}| ${errorStr}`);
  throw newError;
};

/**
 * Processes text through all parsing steps: think tags and JSON markdown
 */
export const processText = (msg: AssistantModelMessage | ToolModelMessage, text: string): string => {
  const { text: afterThink } = parseThinkTags(msg, text);
  const { text: final } = parseJSONMarkdown(msg, afterThink);
  return final;
};

// Export class-like namespace for backward compatibility
export const ResponseParser = {
  parseThinkTags,
  parseJSONMarkdown,
  parseResponseJSON,
  processText,
};
