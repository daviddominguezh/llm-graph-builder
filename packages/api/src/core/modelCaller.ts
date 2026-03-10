import type { LanguageModel } from 'ai';
import { Output, generateText } from 'ai';
import z from 'zod';

import type { ToolModelConfig } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { MessageProcessor } from './messageProcessor.js';
import {
  getModelId,
  logAttempt,
  logFinalError,
  logNoToolCall,
  logStartingCall,
  logSuccess,
  logToolCallDetails,
} from './modelCallerLogger.js';

interface RetryState {
  currentModel: LanguageModel;
  usedFallback: boolean;
  networkRetryCount: number;
}

const MAX_NETWORK_RETRIES = 3;
const FIRST_ATTEMPT = 0;

export interface ModelCallResult {
  response?: { messages?: unknown[] };
  usage?: unknown;
  output?: unknown;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

interface ModelCallContext {
  context: Context;
  correlationId: string;
  requestStartTime: number;
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502')
  );
}

function safeGetOutput(obj: Record<string, unknown>): unknown {
  try {
    return obj.output;
  } catch {
    return undefined;
  }
}

function toModelCallResult(result: unknown): ModelCallResult {
  if (typeof result !== 'object' || result === null) {
    return {};
  }
  const obj = result as Record<string, unknown>;
  return {
    response: obj.response as ModelCallResult['response'],
    usage: obj.usage,
    output: safeGetOutput(obj),
    toolCalls: obj.toolCalls as unknown[] | undefined,
    toolResults: obj.toolResults as unknown[] | undefined,
  };
}

const MODEL_CALL_TIMEOUT_MS = 90000;

async function executeModelCall(
  config: ToolModelConfig & { model: LanguageModel },
  expectedTool: string | undefined,
  timeoutMs = MODEL_CALL_TIMEOUT_MS
): Promise<ModelCallResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const configWithAbort = { ...config, abortSignal: controller.signal };

    if (expectedTool !== undefined && expectedTool !== '') {
      logger.info(`[MODEL_CALL] Tool call mode, expectedTool=${expectedTool}`);
      logger.info(`[MODEL_CALL] Tools available: ${Object.keys(config.tools ?? {}).join(', ')}`);
      logger.info(`[MODEL_CALL] toolChoice: ${JSON.stringify(config.toolChoice)}`);
      logger.info(`[MODEL_CALL] config keys: ${Object.keys(config).join(', ')}`);
      const result = await generateText(configWithAbort);
      const typed = toModelCallResult(result);
      logger.info(`[MODEL_CALL] Result keys: ${Object.keys(typed).join(', ')}`);
      logger.info(`[MODEL_CALL] toolCalls count: ${typed.toolCalls?.length ?? 0}`);
      logger.info(`[MODEL_CALL] toolResults count: ${typed.toolResults?.length ?? 0}`);
      logger.info(`[MODEL_CALL] output: ${JSON.stringify(typed.output)}`);
      logger.info(`[MODEL_CALL] response messages: ${typed.response?.messages?.length ?? 0}`);
      return typed;
    }
    logger.info('[MODEL_CALL] Object output mode (agent_decision)');
    const result = await generateText({
      ...configWithAbort,
      output: Output.object({
        schema: z.object({
          nextNodeID: z.string().nonempty(),
          messageToUser: z.string().nonempty(),
        }),
      }),
    });
    const typed = toModelCallResult(result);
    logger.info(`[MODEL_CALL] Decision result output: ${JSON.stringify(typed.output)}`);
    return typed;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface AttemptResult {
  success: boolean;
  result?: ModelCallResult;
  shouldRetry: boolean;
  newState?: RetryState;
}

async function executeAttempt(
  ctx: ModelCallContext,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  state: RetryState
): Promise<AttemptResult> {
  const attemptStartTime = Date.now();
  const newConfig = {
    ...config,
    messages: MessageProcessor.cleanMessagesBeforeSending(config.messages),
    model: state.currentModel,
  };

  logAttempt(ctx, state, newConfig.messages.length);

  if (expectedTool !== undefined && expectedTool !== '') {
    logToolCallDetails(ctx, expectedTool, newConfig.messages);
  } else {
    logNoToolCall(ctx);
  }

  try {
    const result = await executeModelCall(newConfig, expectedTool);
    const duration = Date.now() - attemptStartTime;
    const totalDuration = Date.now() - ctx.requestStartTime;
    logSuccess({ ctx, state, attemptDuration: duration, totalDuration, usage: result.usage, result });
    return { success: true, result, shouldRetry: false };
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    if (isRetryableError(err) && state.networkRetryCount < MAX_NETWORK_RETRIES) {
      // TODO: Use the rate-limiter for this
    }

    const totalDuration = Date.now() - ctx.requestStartTime;
    logFinalError(ctx, state, err, totalDuration);
    throw error;
  }
}

async function executeWithRetries(
  ctx: ModelCallContext,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  state: RetryState
): Promise<ModelCallResult> {
  const result = await executeAttempt(ctx, config, expectedTool, state);

  if (result.success && result.result !== undefined) {
    return result.result;
  }

  if (result.shouldRetry && result.newState !== undefined) {
    return await executeWithRetries(ctx, config, expectedTool, result.newState);
  }

  throw new Error('Unexpected: model call failed without throwing');
}

export async function callModel(
  context: Context,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  model: LanguageModel
): Promise<ModelCallResult> {
  const requestStartTime = Date.now();
  const correlationId = `${context.tenantID}-${context.userID}-${requestStartTime}`;
  const modelName = getModelId(model);

  const ctx: ModelCallContext = { context, correlationId, requestStartTime };
  const initialState: RetryState = {
    currentModel: model,
    usedFallback: false,
    networkRetryCount: FIRST_ATTEMPT,
  };

  logStartingCall({ ctx, modelName, expectedTool, messageCount: config.messages.length });

  return await executeWithRetries(ctx, config, expectedTool, initialState);
}
