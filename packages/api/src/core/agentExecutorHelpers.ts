import type { AssistantModelMessage, LanguageModel, Tool, ToolModelMessage, TypedToolCall } from 'ai';

import { getOpenRouterModel } from '@src/provider/openRouter.js';
import type { TokenLog, ToolModelConfig } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { AGENT_CONSTANTS, PROMPTS } from './constants.js';
import { ResponseParser } from './responseParser.js';

const INCREMENT_STEP = 1;
const FIRST_INDEX = 0;
const INITIAL_ATTEMPT = 0;

export const getEscalationReason = (attemptCount: number): string => {
  if (attemptCount === INITIAL_ATTEMPT) {
    return 'initial attempt';
  }
  if (attemptCount === AGENT_CONSTANTS.MEDIUM_MODEL_THRESHOLD - INCREMENT_STEP) {
    return 'escalating to medium model';
  }
  if (attemptCount === AGENT_CONSTANTS.MEDIUMHIGH_MODEL_THRESHOLD - INCREMENT_STEP) {
    return 'escalating to medium-high model';
  }
  if (attemptCount === AGENT_CONSTANTS.HIGH_MODEL_THRESHOLD - INCREMENT_STEP) {
    return 'escalating to high model (final attempt)';
  }
  return 'retrying with same tier';
};

interface ToolResultOutput {
  isError?: boolean;
}

function isToolResultOutput(value: unknown): value is ToolResultOutput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('isError' in value)) {
    return true;
  }
  const hasIsError = Object.hasOwn(value, 'isError');
  if (!hasIsError) return true;
  const typedValue = value as { isError: unknown };
  return typeof typedValue.isError === 'boolean';
}

/**
 * Checks if the tool call was successful
 */
export function wasToolCallSuccessful(
  toolResults: Array<{ toolName: string; output: unknown }>,
  expectedTool: string
): boolean {
  return toolResults.some((call) => {
    const output = isToolResultOutput(call.output) ? call.output : undefined;
    return call.toolName.trim() === expectedTool.trim() && output?.isError !== true;
  });
}

/**
 * Filters assistant messages to keep only tool-call parts
 */
export function filterToolCallMessages(
  msgs: Array<AssistantModelMessage | ToolModelMessage>
): Array<AssistantModelMessage | ToolModelMessage> {
  const filtered = msgs
    .map((msg) => {
      if (msg.role !== 'assistant') return msg;
      if (typeof msg.content === 'string') return null;

      const contentFiltered = msg.content.filter((part) => part.type !== 'reasoning' && part.type !== 'text');

      if (contentFiltered.length === FIRST_INDEX) return null;

      const filteredMessage: AssistantModelMessage = {
        ...msg,
        content: contentFiltered,
      };
      return filteredMessage;
    })
    .filter((msg): msg is AssistantModelMessage | ToolModelMessage => msg !== null);

  return filtered;
}

/**
 * Handles retry logic by adding error messages to config
 */
export function prepareRetryConfig(
  config: ToolModelConfig,
  msgs: Array<AssistantModelMessage | ToolModelMessage>
): void {
  const filtered = filterToolCallMessages(msgs);
  config.messages.push(...filtered);

  config.messages.unshift({
    role: 'system',
    content: PROMPTS.TOOL_CALL_FORCE,
  });
}

interface TextContentPart {
  type: 'text';
  text: string;
}

function getPropertyValue(obj: object, key: string): unknown {
  // Object has already been validated to have the key via Object.hasOwn
  return Reflect.get(obj, key) as unknown;
}

function isTextContentPart(part: unknown): part is TextContentPart {
  if (typeof part !== 'object' || part === null) return false;
  const hasType = Object.hasOwn(part, 'type');
  const hasText = Object.hasOwn(part, 'text');
  if (!hasType || !hasText) return false;
  const typeValue = getPropertyValue(part, 'type');
  const textValue = getPropertyValue(part, 'text');
  return typeValue === 'text' && typeof textValue === 'string';
}

/**
 * Processes model response messages for text content
 */
export function processResponseMessages(
  msgs: Array<AssistantModelMessage | ToolModelMessage>
): Array<AssistantModelMessage | ToolModelMessage> {
  return msgs.map((msg) => {
    if (msg.role !== 'assistant') return msg;
    if (typeof msg.content === 'string') return msg;

    const processedContent = msg.content.map((part) => {
      if (!isTextContentPart(part)) return part;
      return { ...part, text: ResponseParser.processText(msg, part.text) };
    });

    const result: AssistantModelMessage = { ...msg, content: processedContent };
    return result;
  });
}

export interface ModelSelection {
  model: LanguageModel;
  name: string;
}

/**
 * Selects the appropriate model based on attempt count and expected tool
 */
export function getModel(apiKey: string): ModelSelection {
  const model = 'google/gemini-3.1-flash-lite-preview';
  return {
    model: getOpenRouterModel(apiKey, model),
    name: model,
  };
}

interface ExecutionSummaryParams {
  context: Context;
  sessionId: string;
  modelWorkedFine: boolean;
  attemptCount: number;
  executionStartTime: number;
  expectedTool?: string;
  tokens: TokenLog;
  allToolCalls: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>>;
  lastError?: Error;
}

export const logExecutionSummary = (params: ExecutionSummaryParams): void => {
  const {
    context,
    sessionId,
    modelWorkedFine,
    attemptCount,
    executionStartTime,
    expectedTool,
    tokens,
    allToolCalls,
    lastError,
  } = params;
  const totalDuration = Date.now() - executionStartTime;

  if (!modelWorkedFine && attemptCount >= AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS) {
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] EXECUTION FAILED`, {
      sessionId,
      totalAttempts: attemptCount,
      totalDuration: `${totalDuration}ms`,
      expectedTool: expectedTool ?? 'none',
      lastError: lastError?.message ?? 'unknown',
      totalTokensUsed: tokens,
      toolCallsAttempted: allToolCalls.length,
    });
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| ERROR: Pausing AI for this chat...`);
  } else if (modelWorkedFine) {
    logger.info(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] EXECUTION SUCCEEDED`, {
      sessionId,
      totalAttempts: attemptCount,
      totalDuration: `${totalDuration}ms`,
      expectedTool: expectedTool ?? 'none',
      totalTokensUsed: tokens,
      toolCallsExecuted: allToolCalls.length,
    });
  }
};

export interface ToolValidationLogParams {
  context: Context;
  sessionId: string;
  expectedTool: string;
  hasSuccessfulCall: boolean;
  toolResults: Array<{ toolName: string; output: unknown }>;
}

export function logToolValidation(params: ToolValidationLogParams): void {
  const { context, sessionId, expectedTool, hasSuccessfulCall, toolResults } = params;

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Tool call validation`, {
    sessionId,
    expectedTool,
    hasSuccessfulCall,
    toolResultsCount: toolResults.length,
    toolResults: toolResults.map((tr) => {
      const outputWithError = isToolResultOutput(tr.output) ? tr.output : undefined;
      return {
        toolName: tr.toolName,
        hasError: outputWithError?.isError === true,
      };
    }),
  });
}

export interface ToolValidationStatusParams {
  context: Context;
  sessionId: string;
  expectedTool: string;
  attemptCount: number;
  modelName: string;
  hasToolCalls: boolean;
}

export function logToolValidationStatus(
  hasSuccessfulCall: boolean,
  params: ToolValidationStatusParams
): void {
  const { context, sessionId, expectedTool, attemptCount, modelName, hasToolCalls } = params;

  if (hasSuccessfulCall) {
    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Tool call successful`,
      {
        sessionId,
        tool: expectedTool,
        attemptNumber: attemptCount + INCREMENT_STEP,
        modelUsed: modelName,
      }
    );
    return;
  }

  if (hasToolCalls) {
    logger.warn(`callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Tool call failed`, {
      sessionId,
      attemptNumber: attemptCount + INCREMENT_STEP,
      remainingAttempts: AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS - attemptCount - INCREMENT_STEP,
      willRetry: attemptCount < AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS - INCREMENT_STEP,
    });
    return;
  }

  logger.warn(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Model did not call tool`,
    {
      sessionId,
      expectedTool,
      attemptNumber: attemptCount + INCREMENT_STEP,
      remainingAttempts: AGENT_CONSTANTS.MAX_RETRY_ATTEMPTS - attemptCount - INCREMENT_STEP,
    }
  );
}
