import type { LanguageModel } from 'ai';

import { logger } from '@src/utils/logger.js';

import {
  MODEL_CALL_TIMEOUT_MS,
  getModelId,
  getProviderFromModel,
  isTimeoutError,
} from '@src/ai/providerFallback.js';

const INCREMENT_STEP = 1;
const MAX_NETWORK_RETRIES = 3;

interface RetryState {
  currentModel: LanguageModel;
  usedFallback: boolean;
  networkRetryCount: number;
}

interface ModelCallContext {
  context: { namespace: string; userID: string };
  correlationId: string;
  requestStartTime: number;
}

function isModelBusyError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('model busy') ||
    message.includes('model is busy') ||
    message.includes('retry later') ||
    message.includes('capacity') ||
    message.includes('overloaded')
  );
}

export function categorizeError(error: Error): string {
  const message = error.message.toLowerCase();

  if (isTimeoutError(error)) return 'TIMEOUT';
  if (isModelBusyError(error)) return 'MODEL_BUSY';
  if (message.includes('rate limit') || message.includes('429')) return 'RATE_LIMIT';
  if (message.includes('503')) return 'SERVICE_UNAVAILABLE';
  if (message.includes('502')) return 'BAD_GATEWAY';
  if (message.includes('network') || message.includes('fetch failed')) return 'NETWORK_ERROR';

  return 'UNKNOWN_ERROR';
}

interface StartingCallParams {
  ctx: ModelCallContext;
  modelName: string;
  provider: string;
  expectedTool: string | undefined;
  messageCount: number;
}

export function logStartingCall(params: StartingCallParams): void {
  const { ctx, modelName, provider, expectedTool, messageCount } = params;
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Starting model call`,
    {
      correlationId: ctx.correlationId,
      modelName,
      provider,
      expectedTool: expectedTool ?? 'none',
      messageCount,
      isToolCall: expectedTool !== undefined && expectedTool !== '',
      timeoutMs: MODEL_CALL_TIMEOUT_MS,
    }
  );
}

export function logAttempt(ctx: ModelCallContext, state: RetryState, messageCount: number): void {
  const currentModelName = getModelId(state.currentModel);
  const currentProvider = getProviderFromModel(state.currentModel) ?? 'unknown-provider';

  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Network attempt ${state.networkRetryCount + INCREMENT_STEP}/${MAX_NETWORK_RETRIES + INCREMENT_STEP}`,
    {
      correlationId: ctx.correlationId,
      modelName: currentModelName,
      provider: currentProvider,
      messageCount,
      usedFallback: state.usedFallback,
    }
  );
}

function getMessageContent(message: unknown): unknown {
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }
  if (!('content' in message)) {
    return undefined;
  }
  return (message as { content: unknown }).content;
}

export function logToolCallDetails(ctx: ModelCallContext, expectedTool: string, messages: unknown[]): void {
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Generating text for tool call: ${expectedTool}`
  );
  const [firstMessage] = messages;
  const content = getMessageContent(firstMessage);
  const promptContent = content === undefined ? 'no messages' : JSON.stringify(content);
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Prompt: ${promptContent}`
  );
}

interface SuccessParams {
  ctx: ModelCallContext;
  state: RetryState;
  attemptDuration: number;
  totalDuration: number;
  usage: unknown;
}

export function logSuccess(params: SuccessParams): void {
  const { ctx, state, attemptDuration, totalDuration, usage } = params;
  const currentModelName = getModelId(state.currentModel);
  const currentProvider = getProviderFromModel(state.currentModel) ?? 'unknown-provider';

  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Model call succeeded`,
    {
      correlationId: ctx.correlationId,
      modelName: currentModelName,
      provider: currentProvider,
      attemptNumber: state.networkRetryCount + INCREMENT_STEP,
      attemptDuration: `${attemptDuration}ms`,
      totalDuration: `${totalDuration}ms`,
      usedFallback: state.usedFallback,
      usage: usage ?? 'not available',
    }
  );
}

export function logFallbackAttempt(
  ctx: ModelCallContext,
  state: RetryState,
  duration: number,
  error: Error
): void {
  const currentModelName = getModelId(state.currentModel);
  const currentProvider = getProviderFromModel(state.currentModel) ?? 'unknown-provider';

  logger.warn(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] TIMEOUT after ${duration}ms - attempting fallback provider`,
    {
      correlationId: ctx.correlationId,
      modelName: currentModelName,
      provider: currentProvider,
      errorCategory: categorizeError(error),
      errorMessage: error.message,
    }
  );
}

export function logFallbackSwitch(ctx: ModelCallContext, newModel: LanguageModel): void {
  const fallbackModelName = getModelId(newModel);
  const fallbackProvider = getProviderFromModel(newModel) ?? 'unknown-provider';
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Switching to fallback model: ${fallbackModelName} (provider: ${fallbackProvider})`
  );
}

interface RetryAttemptParams {
  ctx: ModelCallContext;
  state: RetryState;
  error: Error;
  duration: number;
  backoffMs: number;
}

export function logRetryAttempt(params: RetryAttemptParams): void {
  const { ctx, state, error, duration, backoffMs } = params;
  const currentModelName = getModelId(state.currentModel);
  const currentProvider = getProviderFromModel(state.currentModel) ?? 'unknown-provider';
  const modelBusy = isModelBusyError(error);
  const timeout = isTimeoutError(error);
  const statusMessage = modelBusy ? 'MODEL BUSY' : timeout ? 'TIMEOUT' : 'Network error';

  logger.warn(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] ${statusMessage} on attempt ${state.networkRetryCount}/${MAX_NETWORK_RETRIES + INCREMENT_STEP}`,
    {
      correlationId: ctx.correlationId,
      modelName: currentModelName,
      provider: currentProvider,
      errorCategory: categorizeError(error),
      errorMessage: error.message,
      attemptDuration: `${duration}ms`,
      backoffMs: `${backoffMs}ms`,
      retriesRemaining: MAX_NETWORK_RETRIES - state.networkRetryCount,
      usedFallback: state.usedFallback,
    }
  );

  if (modelBusy) {
    logger.warn(
      `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Model capacity issue detected - retrying after backoff.`
    );
  }
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Retrying after ${backoffMs}ms...`
  );
}

export function logFinalError(
  ctx: ModelCallContext,
  state: RetryState,
  error: Error,
  totalDuration: number
): void {
  const currentModelName = getModelId(state.currentModel);
  const currentProvider = getProviderFromModel(state.currentModel) ?? 'unknown-provider';

  logger.error(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Model call failed after ${state.networkRetryCount + INCREMENT_STEP} attempts`,
    {
      correlationId: ctx.correlationId,
      modelName: currentModelName,
      provider: currentProvider,
      errorCategory: categorizeError(error),
      errorName: error.name,
      errorMessage: error.message,
      isModelBusy: isModelBusyError(error),
      isTimeout: isTimeoutError(error),
      totalAttempts: state.networkRetryCount + INCREMENT_STEP,
      totalDuration: `${totalDuration}ms`,
      usedFallback: state.usedFallback,
      willEscalate: true,
    }
  );

  logger.error(`callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| Error name: ${error.name}`);
  logger.error(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| Error message: ${error.message}`
  );
  logger.error(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| Stack trace:\n${error.stack ?? 'no stack'}`
  );
}

export function logNoToolCall(ctx: ModelCallContext): void {
  logger.info(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] Generating object (no tool call expected)`
  );
}

export function logNoFallbackAvailable(ctx: ModelCallContext): void {
  logger.warn(
    `callAgentStep/${ctx.context.namespace}/${ctx.context.userID}| [MODEL_CALLER] No fallback available - will retry with same model`
  );
}
