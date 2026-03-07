import type { LanguageModel } from 'ai';
import { Output, generateText } from 'ai';
import z from 'zod';

import type { ToolModelConfig } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';

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

function toModelCallResult(result: unknown): ModelCallResult {
  if (typeof result !== 'object' || result === null) {
    return {};
  }
  return result as ModelCallResult;
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
      const result = await generateText(configWithAbort);
      return toModelCallResult(result);
    }
    const result = await generateText({
      ...configWithAbort,
      output: Output.object({
        schema: z.object({
          nextNodeID: z.string().nonempty(),
          messageToUser: z.string().nonempty(),
        }),
      }),
    });
    return toModelCallResult(result);
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
    logSuccess({ ctx, state, attemptDuration: duration, totalDuration, usage: result.usage });
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
