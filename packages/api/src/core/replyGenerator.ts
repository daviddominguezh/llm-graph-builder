import type { AssistantModelMessage, ToolModelMessage } from 'ai';

import { getNode } from '@src/stateMachine/graph/index.js';
import type { ParsedResult, ToolModelConfig } from '@src/types/ai/ai.js';
import type { MESSAGES_PROVIDER, Message } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { executeAgent } from './agentExecutor.js';
import { MessageProcessor } from './messageProcessor.js';
import { ResponseParser } from './responseParser.js';
import type { ReplyGenerationResult } from './types.js';

const LAST_INDEX_OFFSET = 1;
const EMPTY_STRING = '';

interface GenerateReplyParams {
  context: Context;
  provider: MESSAGES_PROVIDER;
  config: ToolModelConfig;
  messages: Message[];
  step: string;
  nodes: Record<string, string>;
  nextNodeKnown?: string;
}

/**
 * Extracts and parses the response from agent messages
 */
function extractAndParseResponse(msgs: Array<AssistantModelMessage | ToolModelMessage>): {
  textPart: string;
  reasoningPart: string;
} {
  const textParts = MessageProcessor.extractContentByType(msgs, 'text');
  const reasoningParts = MessageProcessor.extractContentByType(msgs, 'reasoning');

  const [firstMsg] = msgs;
  if (firstMsg === undefined || firstMsg.role === 'tool') {
    return { textPart: EMPTY_STRING, reasoningPart: EMPTY_STRING };
  }

  const [firstTextPart] = textParts;
  const textPartInput = firstTextPart ?? EMPTY_STRING;
  const { text: textPart } = ResponseParser.parseThinkTags(firstMsg, textPartInput);
  const { text: responseStr } = ResponseParser.parseJSONMarkdown(firstMsg, textPart);

  const [firstReasoningPart] = reasoningParts;
  const reasoningPartInput = firstReasoningPart ?? EMPTY_STRING;
  const { text: reasoningPart } = ResponseParser.parseThinkTags(firstMsg, reasoningPartInput);
  const { text: reasoningResponseStr } = ResponseParser.parseJSONMarkdown(firstMsg, reasoningPart);

  return {
    textPart: responseStr,
    reasoningPart: reasoningResponseStr,
  };
}

/**
 * Determines the next node based on parsed result or known next node
 */
function resolveNextNode(
  context: Context,
  parsedResult: ParsedResult,
  nodes: Record<string, string>,
  nextNodeKnown?: string
): string {
  const { nextNodeID: outputNodeNumber } = parsedResult;
  let resolvedOutputNode = outputNodeNumber;

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| OUTPUT NODE: ${outputNodeNumber}`);
  if (nextNodeKnown !== undefined && nextNodeKnown !== '') {
    resolvedOutputNode = nextNodeKnown;
    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| BUT, nextNode was known: ${resolvedOutputNode}`
    );
  }

  const { [resolvedOutputNode]: nextNodeID } = nodes;
  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| nextNode: ${nextNodeID ?? 'undefined'}`);

  return nextNodeID ?? '';
}

/**
 * Removes messageToUser if the next node is not a reply node
 */
function cleanNonReplyMessage(
  context: Context,
  msg: AssistantModelMessage | ToolModelMessage,
  nextNodeID: string,
  parsedResult: ParsedResult
): ParsedResult {
  const nextNode = getNode(context.graph, nextNodeID);
  const isReplyNode = nextNode.nextNodeIsUser === true;

  if (isReplyNode || msg.role !== 'assistant') {
    return parsedResult;
  }

  const cleanedResult: ParsedResult = { ...parsedResult, messageToUser: undefined };
  return cleanedResult;
}

const isAssistantMessage = (msg: AssistantModelMessage | ToolModelMessage): msg is AssistantModelMessage =>
  msg.role === 'assistant';

/**
 * Generates a reply from the agent without tool calls
 */
export async function generateReply(params: GenerateReplyParams): Promise<ReplyGenerationResult> {
  const { context, provider, config, messages, step, nodes, nextNodeKnown } = params;
  const reply = await executeAgent({ context, provider, config, messages, step });

  const { tokens, messages: msgs, copyMsgs } = reply;

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| New messages:`, JSON.stringify(msgs));

  const { textPart, reasoningPart } = extractAndParseResponse(msgs);
  const parsedResult = ResponseParser.parseResponseJSON(context, textPart, reasoningPart);

  const nextNodeID = resolveNextNode(context, parsedResult, nodes, nextNodeKnown);

  const [firstMsg] = msgs;
  if (firstMsg === undefined) {
    throw new Error('Expected at least one message from agent');
  }
  const cleanedResult = cleanNonReplyMessage(context, firstMsg, nextNodeID, parsedResult);

  const lastIndex = msgs.length - LAST_INDEX_OFFSET;
  const [lastMsg] = msgs.slice(lastIndex);

  if (lastMsg === undefined || !isAssistantMessage(lastMsg)) {
    throw new Error('Expected last message to be an assistant message');
  }

  return {
    result: cleanedResult,
    tokens,
    toolCalls: reply.toolCalls,
    lastMessage: lastMsg,
    copyMsgs,
  };
}
