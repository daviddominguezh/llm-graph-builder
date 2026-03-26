import type { AssistantModelMessage, Tool, ToolModelMessage, TypedToolCall } from 'ai';

import type { ToolModelConfig } from '@src/types/ai/ai.js';
import type { TokenLog } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { getTokensUsage } from '@src/utils/tokens.js';

import {
  logToolValidation,
  logToolValidationStatus,
  prepareRetryConfig,
  wasToolCallSuccessful,
} from './agentExecutorHelpers.js';
import { accumulateTokens } from './tokenTracker.js';
import type { ReplyUsageInfo, ReplyWithObject } from './types.js';

const INCREMENT_STEP = 1;
const FIRST_INDEX = 0;
const ZERO_TOKENS = 0;

export interface ProcessReplyParams {
  context: Context;
  sessionId: string;
  config: ToolModelConfig;
  expectedTool?: string;
  attemptCount: number;
  attemptStartTime: number;
  tokens: TokenLog;
  allToolCalls: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>>;
  allToolResults: Array<{ toolName: string; output: unknown }>;
  modelName: string;
}

interface ToolValidationParams {
  context: Context;
  sessionId: string;
  expectedTool: string;
  toolResults: Array<{ toolName: string; output: unknown }>;
  toolCalls: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>>;
  attemptCount: number;
  config: ToolModelConfig;
  msgs: Array<AssistantModelMessage | ToolModelMessage>;
  modelName: string;
}

function handleToolValidation(params: ToolValidationParams): boolean {
  const { context, sessionId, expectedTool, toolResults, toolCalls, attemptCount, config, msgs, modelName } =
    params;
  const hasSuccessfulCall = wasToolCallSuccessful(toolResults, expectedTool);

  logToolValidation({ context, sessionId, expectedTool, hasSuccessfulCall, toolResults });
  logToolValidationStatus(hasSuccessfulCall, {
    context,
    sessionId,
    expectedTool,
    attemptCount,
    modelName,
    hasToolCalls: toolCalls.length > FIRST_INDEX,
  });

  if (!hasSuccessfulCall && toolCalls.length > FIRST_INDEX) {
    prepareRetryConfig(config, msgs);
  }

  return hasSuccessfulCall;
}

function isReplyWithObject(value: unknown): value is ReplyWithObject {
  return typeof value === 'object' && value !== null;
}

function extractReplyData(reply: unknown): ReplyWithObject {
  if (isReplyWithObject(reply)) {
    return reply;
  }
  return {};
}

interface UsageResult {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  costUSD?: number;
}

function getInputTokens(rawUsage: ReplyUsageInfo | undefined): number {
  return rawUsage?.inputTokens ?? rawUsage?.promptTokens ?? ZERO_TOKENS;
}

function getOutputTokens(rawUsage: ReplyUsageInfo | undefined): number {
  return rawUsage?.outputTokens ?? rawUsage?.completionTokens ?? ZERO_TOKENS;
}

interface ExtractUsageOptions {
  rawUsage: ReplyUsageInfo | undefined;
  costUSD: number | undefined;
}

function extractUsage(options: ExtractUsageOptions): UsageResult {
  const { rawUsage, costUSD } = options;
  const inputTokens = getInputTokens(rawUsage);
  const outputTokens = getOutputTokens(rawUsage);
  const cachedInputTokens = rawUsage?.cachedInputTokens ?? ZERO_TOKENS;
  return { inputTokens, outputTokens, cachedInputTokens, totalTokens: inputTokens + outputTokens, costUSD };
}

function buildResponseMessages(typedReply: ReplyWithObject): Array<AssistantModelMessage | ToolModelMessage> {
  const responseMsg = typedReply.output === undefined ? '' : JSON.stringify(typedReply.output);
  return (
    typedReply.response?.messages ?? [{ role: 'assistant', content: [{ type: 'text', text: responseMsg }] }]
  );
}

interface ResponseLogParams {
  context: Context;
  sessionId: string;
  attemptCount: number;
  modelName: string;
  toolCallsCount: number;
  attemptStartTime: number;
  typedReply: ReplyWithObject;
}

function logResponseReceived(params: ResponseLogParams): void {
  const { context, sessionId, attemptCount, modelName, toolCallsCount, attemptStartTime, typedReply } =
    params;
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Model response received`,
    {
      sessionId,
      attemptNumber: attemptCount + INCREMENT_STEP,
      modelName,
      toolCallsCount,
      duration: `${Date.now() - attemptStartTime}ms`,
      responseObject: typedReply.output,
    }
  );
}

function processReplyCore(
  params: ProcessReplyParams,
  typedReply: ReplyWithObject
): { modelWorkedFine: boolean; msgs: Array<AssistantModelMessage | ToolModelMessage> } {
  const {
    context,
    sessionId,
    expectedTool,
    attemptCount,
    attemptStartTime,
    tokens,
    allToolCalls,
    allToolResults,
    modelName,
  } = params;
  const toolCalls = typedReply.toolCalls ?? [];
  const toolResults = typedReply.toolResults ?? [];

  logResponseReceived({
    context,
    sessionId,
    attemptCount,
    modelName,
    toolCallsCount: toolCalls.length,
    attemptStartTime,
    typedReply,
  });

  if (toolCalls.length > FIRST_INDEX) {
    allToolCalls.push(...toolCalls);
  }
  if (toolResults.length > FIRST_INDEX) {
    allToolResults.push(...toolResults);
  }

  const msgs = buildResponseMessages(typedReply);

  const { usage: rawUsage, costUSD } = typedReply;
  accumulateTokens(tokens, getTokensUsage(extractUsage({ rawUsage, costUSD })));

  if (expectedTool === undefined) {
    return { modelWorkedFine: true, msgs };
  }

  return { modelWorkedFine: false, msgs };
}

function processReplyWithToolValidation(
  params: ProcessReplyParams,
  typedReply: ReplyWithObject,
  msgs: Array<AssistantModelMessage | ToolModelMessage>
): boolean {
  const { context, sessionId, config, expectedTool, attemptCount, modelName } = params;
  const toolCalls = typedReply.toolCalls ?? [];
  const toolResults = typedReply.toolResults ?? [];
  const { output: resp } = typedReply;
  const strResp = JSON.stringify(resp);
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| [AGENT_EXECUTOR] Tool call raw response:\n${strResp}`
  );

  if (expectedTool === undefined) {
    return true;
  }

  return handleToolValidation({
    context,
    sessionId,
    expectedTool,
    toolResults,
    toolCalls,
    attemptCount,
    config,
    msgs,
    modelName,
  });
}

export function processReply(
  reply: unknown,
  params: ProcessReplyParams
): { modelWorkedFine: boolean; msgs: Array<AssistantModelMessage | ToolModelMessage> } {
  const typedReply = extractReplyData(reply);
  const result = processReplyCore(params, typedReply);

  if (result.modelWorkedFine) {
    return result;
  }

  const modelWorkedFine = processReplyWithToolValidation(params, typedReply, result.msgs);
  return { modelWorkedFine, msgs: result.msgs };
}
