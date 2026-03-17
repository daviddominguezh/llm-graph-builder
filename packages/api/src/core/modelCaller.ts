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
  costUSD?: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeGetOutput(obj: Record<string, unknown>): unknown {
  try {
    return obj.output;
  } catch {
    return undefined;
  }
}

function getNestedRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const { [key]: value } = obj;
  return isRecord(value) ? value : undefined;
}

function getNumericCost(obj: Record<string, unknown>): number | undefined {
  return typeof obj.cost === 'number' ? obj.cost : undefined;
}

function extractOpenRouterCost(result: Record<string, unknown>): number | undefined {
  const metadata = getNestedRecord(result, 'providerMetadata');
  if (metadata === undefined) return undefined;
  const openrouter = getNestedRecord(metadata, 'openrouter');
  if (openrouter === undefined) return undefined;
  const orUsage = getNestedRecord(openrouter, 'usage');
  return orUsage === undefined ? undefined : getNumericCost(orUsage);
}

function extractRawUsageCost(result: Record<string, unknown>): number | undefined {
  const usage = getNestedRecord(result, 'usage');
  if (usage === undefined) return undefined;
  const raw = getNestedRecord(usage, 'raw');
  return raw === undefined ? undefined : getNumericCost(raw);
}

function extractCostFromResult(result: Record<string, unknown>): number | undefined {
  return extractOpenRouterCost(result) ?? extractRawUsageCost(result);
}

function toModelCallResult(result: unknown): ModelCallResult {
  if (!isRecord(result)) return {};
  return {
    response: isRecord(result.response) ? (result.response as ModelCallResult['response']) : undefined,
    usage: result.usage,
    output: safeGetOutput(result),
    toolCalls: Array.isArray(result.toolCalls) ? (result.toolCalls as unknown[]) : undefined,
    toolResults: Array.isArray(result.toolResults) ? (result.toolResults as unknown[]) : undefined,
    costUSD: extractCostFromResult(result),
  };
}

const MODEL_CALL_TIMEOUT_MS = 90000;

const DEFAULT_OUTPUT_SCHEMA = z.object({
  nextNodeID: z.string().nonempty(),
  messageToUser: z.string().nonempty(),
});

export const DECISION_ONLY_OUTPUT_SCHEMA = z.object({
  nextNodeID: z.string().nonempty(),
});

export const TERMINAL_OUTPUT_SCHEMA = z.object({
  messageToUser: z.string().nonempty(),
});

export type OutputSchema = z.ZodObject<Record<string, z.ZodType>>;

interface ModelCallOptions {
  expectedTool: string | undefined;
  outputSchema?: OutputSchema;
  timeoutMs?: number;
}

async function executeModelCall(
  config: ToolModelConfig & { model: LanguageModel },
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const { expectedTool, outputSchema, timeoutMs = MODEL_CALL_TIMEOUT_MS } = options;
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

    const schema = outputSchema ?? DEFAULT_OUTPUT_SCHEMA;
    const result = await generateText({
      ...configWithAbort,
      output: Output.object({ schema }),
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

interface AttemptParams {
  ctx: ModelCallContext;
  config: ToolModelConfig;
  state: RetryState;
  options: ModelCallOptions;
}

async function executeAttempt(params: AttemptParams): Promise<AttemptResult> {
  const { ctx, config, state, options } = params;
  const { expectedTool } = options;
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
    const result = await executeModelCall(newConfig, options);
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
  state: RetryState,
  options: ModelCallOptions
): Promise<ModelCallResult> {
  const result = await executeAttempt({ ctx, config, state, options });

  if (result.success && result.result !== undefined) {
    return result.result;
  }

  if (result.shouldRetry && result.newState !== undefined) {
    return await executeWithRetries(ctx, config, result.newState, options);
  }

  throw new Error('Unexpected: model call failed without throwing');
}

interface CallModelParams {
  expectedTool: string | undefined;
  model: LanguageModel;
  outputSchema?: OutputSchema;
}

export async function callModel(
  context: Context,
  config: ToolModelConfig,
  params: CallModelParams
): Promise<ModelCallResult> {
  const { expectedTool, model, outputSchema } = params;
  const requestStartTime = Date.now();
  const correlationId = `${context.tenantID}-${context.userID}-${requestStartTime}`;
  const modelName = getModelId(model);

  const ctx: ModelCallContext = { context, correlationId, requestStartTime };
  const initialState: RetryState = {
    currentModel: model,
    usedFallback: false,
    networkRetryCount: FIRST_ATTEMPT,
  };
  const options: ModelCallOptions = { expectedTool, outputSchema };

  logStartingCall({ ctx, modelName, expectedTool, messageCount: config.messages.length });

  return await executeWithRetries(ctx, config, initialState, options);
}
