import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage } from 'ai';
import { generateText } from 'ai';

import { getOpenRouterModel } from '@src/provider/openRouter.js';
import type { TokenLog } from '@src/types/ai/logs.js';
import { logger } from '@src/utils/logger.js';

import type { AgentToolCallRecord } from './agentLoopTypes.js';

const TEMPERATURE = 0;
const TIMEOUT_MS = 90000;
const ZERO = 0;
const JSON_NO_INDENT = 0;

function log(label: string, data?: unknown): void {
  const msg = data === undefined ? label : `${label}: ${JSON.stringify(data, null, JSON_NO_INDENT)}`;
  logger.debug('[agentLlmCaller]', msg);
}

export interface LlmCallParams {
  apiKey: string;
  modelId: string;
  messages: ModelMessage[];
  tools: Record<string, Tool>;
}

export interface LlmCallResult {
  text: string;
  toolCalls: AgentToolCallRecord[];
  responseMessages: Array<AssistantModelMessage | ToolModelMessage>;
  tokens: TokenLog;
  costUSD: number | undefined;
  reasoning: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function extractCostFromResult(result: Record<string, unknown>): number | undefined {
  const meta = asRecord(result.providerMetadata);
  if (meta === null) return undefined;
  const or = asRecord(meta.openrouter);
  if (or === null) return undefined;
  const usage = asRecord(or.usage);
  if (usage === null) return undefined;
  return typeof usage.cost === 'number' ? usage.cost : undefined;
}

function extractTokens(usage: unknown): TokenLog {
  const u = asRecord(usage);
  if (u === null) {
    return { input: ZERO, output: ZERO, cached: ZERO };
  }
  return {
    input: typeof u.promptTokens === 'number' ? u.promptTokens : ZERO,
    output: typeof u.completionTokens === 'number' ? u.completionTokens : ZERO,
    cached: typeof u.cachedTokens === 'number' ? u.cachedTokens : ZERO,
  };
}

interface RawToolCall {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  input?: unknown;
}

function toRawToolCall(item: unknown): RawToolCall {
  if (!isRecord(item)) return {};
  return {
    toolCallId: typeof item.toolCallId === 'string' ? item.toolCallId : undefined,
    toolName: typeof item.toolName === 'string' ? item.toolName : undefined,
    args: item.args,
    input: item.input,
  };
}

function mapToolCalls(raw: unknown): AgentToolCallRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toRawToolCall).map((tc) => ({
    toolCallId: tc.toolCallId ?? '',
    toolName: tc.toolName ?? '',
    input: tc.args ?? tc.input,
    output: undefined,
  }));
}

function isResponseMessages(value: unknown): value is LlmCallResult['responseMessages'] {
  return Array.isArray(value);
}

function findReasoningText(part: unknown): string | undefined {
  if (!isRecord(part)) return undefined;
  if (part.type !== 'reasoning') return undefined;
  return typeof part.text === 'string' ? part.text : undefined;
}

function findReasoningInAssistantMessage(msg: AssistantModelMessage): string | undefined {
  if (typeof msg.content === 'string') return undefined;
  for (const part of msg.content) {
    const text = findReasoningText(part);
    if (text !== undefined) return text;
  }
  return undefined;
}

function extractReasoning(responseMessages: LlmCallResult['responseMessages']): string | undefined {
  for (const msg of responseMessages) {
    if (msg.role !== 'assistant') continue;
    const text = findReasoningInAssistantMessage(msg);
    if (text !== undefined) return text;
  }
  return undefined;
}

function extractResponseMessages(result: Record<string, unknown>): LlmCallResult['responseMessages'] {
  const resp = asRecord(result.response);
  if (resp === null) return [];
  const { messages } = resp;
  if (isResponseMessages(messages)) return messages;
  return [];
}

function extractToolResultsFromMessage(
  msg: LlmCallResult['responseMessages'][number],
  outputMap: Map<string, unknown>
): void {
  if (msg.role !== 'tool') return;
  for (const part of msg.content) {
    if (part.type === 'tool-result') {
      outputMap.set(part.toolCallId, part.output);
    }
  }
}

/** Build a map of toolCallId -> output from tool-result messages in responseMessages */
function buildToolOutputMap(responseMessages: LlmCallResult['responseMessages']): Map<string, unknown> {
  const outputMap = new Map<string, unknown>();
  for (const msg of responseMessages) {
    extractToolResultsFromMessage(msg, outputMap);
  }
  return outputMap;
}

/** Populate tool call records with outputs extracted from responseMessages */
function populateToolOutputs(
  toolCalls: AgentToolCallRecord[],
  outputMap: Map<string, unknown>
): AgentToolCallRecord[] {
  return toolCalls.map((tc) => ({
    ...tc,
    output: outputMap.get(tc.toolCallId),
  }));
}

function processLlmResponse(result: Record<string, unknown>): LlmCallResult {
  log('LLM response received', {
    textLength: typeof result.text === 'string' ? result.text.length : ZERO,
    hasToolCalls: Array.isArray(result.toolCalls) && (result.toolCalls as unknown[]).length > ZERO,
  });
  const tokens = extractTokens(result.usage);
  tokens.costUSD = extractCostFromResult(result);
  const responseMessages = extractResponseMessages(result);
  log('response messages', { count: responseMessages.length, roles: responseMessages.map((m) => m.role) });
  const reasoning = extractReasoning(responseMessages);
  const outputMap = buildToolOutputMap(responseMessages);
  const toolCalls = populateToolOutputs(mapToolCalls(result.toolCalls), outputMap);
  log('tool calls', { count: toolCalls.length, names: toolCalls.map((tc) => tc.toolName) });

  return {
    text: typeof result.text === 'string' ? result.text : '',
    toolCalls,
    responseMessages,
    tokens,
    costUSD: tokens.costUSD,
    reasoning,
  };
}

export async function callAgentLlm(params: LlmCallParams): Promise<LlmCallResult> {
  log('calling LLM', {
    modelId: params.modelId,
    messageCount: params.messages.length,
    toolNames: Object.keys(params.tools),
  });
  const model = getOpenRouterModel(params.apiKey, params.modelId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const config = {
      model,
      temperature: TEMPERATURE,
      messages: params.messages,
      tools: params.tools,
      abortSignal: controller.signal,
      providerOptions: { openai: { store: true } },
    };

    const result = await generateText(config);

    return processLlmResponse({
      text: result.text,
      toolCalls: result.toolCalls,
      usage: result.usage,
      response: result.response,
      providerMetadata: result.providerMetadata,
    });
  } catch (err) {
    log('LLM call FAILED', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
