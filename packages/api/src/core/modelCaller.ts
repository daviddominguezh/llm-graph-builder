import type { LanguageModel } from 'ai';
import { generateObject, generateText } from 'ai';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import z from 'zod';

import {
  MODEL_CALL_TIMEOUT_MS,
  getFallbackModel,
  getModelId,
  getProviderFromModel,
  isTimeoutError,
} from '@src/ai/providerFallback.js';

import type { ToolModelConfig } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/ai/tools.js';

import { MessageProcessor } from './messageProcessor.js';
import {
  logAttempt,
  logFallbackAttempt,
  logFallbackSwitch,
  logFinalError,
  logNoFallbackAvailable,
  logNoToolCall,
  logRetryAttempt,
  logStartingCall,
  logSuccess,
  logToolCallDetails,
} from './modelCallerLogger.js';

const MAX_NETWORK_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;
const BACKOFF_MULTIPLIER = 2;
const INCREMENT_STEP = 1;
const FIRST_ATTEMPT = 0;

export interface ModelCallResult {
  response?: { messages?: unknown[] };
  usage?: unknown;
  object?: unknown;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

interface RetryState {
  currentModel: LanguageModel;
  usedFallback: boolean;
  networkRetryCount: number;
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

async function executeModelCall(
  config: ToolModelConfig & { model: LanguageModel },
  expectedTool: string | undefined,
  timeoutMs: number
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
    const result = await generateObject({
      ...configWithAbort,
      schema: z.object({
        nextNodeID: z.string().nonempty(),
        messageToUser: z.string().nonempty(),
      }),
    });
    return toModelCallResult(result);
  } finally {
    clearTimeout(timeoutId);
  }
}

function calculateBackoff(retryCount: number): number {
  const exponentialBackoff = BASE_BACKOFF_MS * BACKOFF_MULTIPLIER ** (retryCount - INCREMENT_STEP);
  return Math.min(exponentialBackoff, MAX_BACKOFF_MS);
}

function tryFallbackModel(state: RetryState): LanguageModel | null {
  const fallbackModelWithCapabilities = getFallbackModel(state.currentModel);
  if (fallbackModelWithCapabilities === null) {
    return null;
  }
  return fallbackModelWithCapabilities.model;
}

async function sleep(ms: number): Promise<void> {
  await setTimeoutPromise(ms);
}

interface AttemptResult {
  success: boolean;
  result?: ModelCallResult;
  shouldRetry: boolean;
  newState?: RetryState;
}

function handleTimeoutFallback(
  ctx: ModelCallContext,
  state: RetryState,
  duration: number,
  err: Error
): AttemptResult | null {
  logFallbackAttempt(ctx, state, duration, err);
  const fallbackModel = tryFallbackModel(state);
  if (fallbackModel !== null) {
    logFallbackSwitch(ctx, fallbackModel);
    return {
      success: false,
      shouldRetry: true,
      newState: { currentModel: fallbackModel, usedFallback: true, networkRetryCount: FIRST_ATTEMPT },
    };
  }
  logNoFallbackAvailable(ctx);
  return null;
}

function tryHandleTimeoutFallback(
  ctx: ModelCallContext,
  state: RetryState,
  duration: number,
  err: Error
): AttemptResult | null {
  const canTryFallback = isTimeoutError(err) && !state.usedFallback;
  if (!canTryFallback) {
    return null;
  }
  return handleTimeoutFallback(ctx, state, duration, err);
}

async function handleRetryableError(
  ctx: ModelCallContext,
  state: RetryState,
  err: Error,
  duration: number
): Promise<AttemptResult> {
  const newRetryCount = state.networkRetryCount + INCREMENT_STEP;
  const backoffMs = calculateBackoff(newRetryCount);
  logRetryAttempt({
    ctx,
    state: { ...state, networkRetryCount: newRetryCount },
    error: err,
    duration,
    backoffMs,
  });
  await sleep(backoffMs);
  return { success: false, shouldRetry: true, newState: { ...state, networkRetryCount: newRetryCount } };
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
    const result = await executeModelCall(newConfig, expectedTool, MODEL_CALL_TIMEOUT_MS);
    const duration = Date.now() - attemptStartTime;
    const totalDuration = Date.now() - ctx.requestStartTime;
    logSuccess({ ctx, state, attemptDuration: duration, totalDuration, usage: result.usage });
    return { success: true, result, shouldRetry: false };
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    const duration = Date.now() - attemptStartTime;

    const fallbackResult = tryHandleTimeoutFallback(ctx, state, duration, err);
    if (fallbackResult !== null) return fallbackResult;

    if (isRetryableError(err) && state.networkRetryCount < MAX_NETWORK_RETRIES) {
      return await handleRetryableError(ctx, state, err, duration);
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
  const correlationId = `${context.namespace}-${context.userID}-${requestStartTime}`;
  const modelName = getModelId(model);
  const provider = getProviderFromModel(model) ?? 'unknown-provider';

  const ctx: ModelCallContext = { context, correlationId, requestStartTime };
  const initialState: RetryState = {
    currentModel: model,
    usedFallback: false,
    networkRetryCount: FIRST_ATTEMPT,
  };

  logStartingCall({ ctx, modelName, provider, expectedTool, messageCount: config.messages.length });

  return await executeWithRetries(ctx, config, expectedTool, initialState);
}
