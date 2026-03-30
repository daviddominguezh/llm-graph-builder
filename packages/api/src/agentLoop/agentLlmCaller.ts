import type { AssistantModelMessage, ModelMessage, Tool, ToolModelMessage } from 'ai';
import { generateText } from 'ai';

import { getOpenRouterModel } from '@src/provider/openRouter.js';
import type { TokenLog } from '@src/types/ai/logs.js';

import type { AgentToolCallRecord } from './agentLoopTypes.js';

const TEMPERATURE = 0;
const TIMEOUT_MS = 90000;
const ZERO = 0;

function log(label: string, data?: unknown): void {
  const prefix = '[agentLlmCaller]';
  if (data !== undefined) {
    process.stderr.write(`${prefix} ${label}: ${JSON.stringify(data, null, 0)}\n`);
  } else {
    process.stderr.write(`${prefix} ${label}\n`);
  }
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
}

function extractCostFromResult(result: Record<string, unknown>): number | undefined {
  const meta = result.providerMetadata;
  if (typeof meta !== 'object' || meta === null) return undefined;
  const or = (meta as Record<string, unknown>).openrouter;
  if (typeof or !== 'object' || or === null) return undefined;
  const usage = (or as Record<string, unknown>).usage;
  if (typeof usage !== 'object' || usage === null) return undefined;
  const cost = (usage as Record<string, unknown>).cost;
  return typeof cost === 'number' ? cost : undefined;
}

function extractTokens(usage: unknown): TokenLog {
  if (typeof usage !== 'object' || usage === null) {
    return { input: ZERO, output: ZERO, cached: ZERO };
  }
  const u = usage as Record<string, unknown>;
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

function mapToolCalls(raw: unknown): AgentToolCallRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawToolCall[]).map((tc) => ({
    toolCallId: typeof tc.toolCallId === 'string' ? tc.toolCallId : '',
    toolName: typeof tc.toolName === 'string' ? tc.toolName : '',
    input: tc.args ?? tc.input,
    output: undefined,
  }));
}

function extractResponseMessages(result: Record<string, unknown>): LlmCallResult['responseMessages'] {
  const resp = result.response;
  if (typeof resp !== 'object' || resp === null) return [];
  const msgs = (resp as Record<string, unknown>).messages;
  if (!Array.isArray(msgs)) return [];
  return msgs as LlmCallResult['responseMessages'];
}

/** Build a map of toolCallId -> output from tool-result messages in responseMessages */
function buildToolOutputMap(responseMessages: LlmCallResult['responseMessages']): Map<string, unknown> {
  const outputMap = new Map<string, unknown>();
  for (const msg of responseMessages) {
    if (msg.role !== 'tool') continue;
    for (const part of msg.content) {
      if (part.type === 'tool-result') {
        outputMap.set(part.toolCallId, part.output);
      }
    }
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
    const result = await generateText({
      model,
      temperature: TEMPERATURE,
      messages: params.messages,
      tools: params.tools,
      abortSignal: controller.signal,
      providerOptions: { openai: { store: true } },
    });

    const raw = result as unknown as Record<string, unknown>;
    log('LLM response received', {
      textLength: typeof result.text === 'string' ? result.text.length : 0,
      hasToolCalls: Array.isArray(raw.toolCalls) && (raw.toolCalls as unknown[]).length > ZERO,
    });
    const tokens = extractTokens(raw.usage);
    tokens.costUSD = extractCostFromResult(raw);
    const responseMessages = extractResponseMessages(raw);
    log('response messages', { count: responseMessages.length, roles: responseMessages.map((m) => m.role) });
    const outputMap = buildToolOutputMap(responseMessages);
    const toolCalls = populateToolOutputs(mapToolCalls(raw.toolCalls), outputMap);
    log('tool calls', { count: toolCalls.length, names: toolCalls.map((tc) => tc.toolName) });

    return {
      text: typeof result.text === 'string' ? result.text : '',
      toolCalls,
      responseMessages,
      tokens,
      costUSD: tokens.costUSD,
    };
  } catch (err) {
    log('LLM call FAILED', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
