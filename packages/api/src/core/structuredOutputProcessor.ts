import type { ModelMessage } from 'ai';

import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';
import { formatMessages } from '@src/utils/messages.js';
import { outputSchemaToZod } from '@src/utils/outputSchemaToZod.js';
import { getTokensUsage } from '@src/utils/tokens.js';

import { getModel } from './agentExecutorHelpers.js';
import { getConfig } from './config.js';
import { callModel } from './modelCaller.js';
import type { ModelCallResult } from './modelCaller.js';
import type { ToolCallsArray } from './nodeProcessorHelpers.js';
import { accumulateTokens } from './tokenTracker.js';
import type { CallAgentInput, NodeProcessingConfig, ReplyUsageInfo } from './types.js';

const LAST_INDEX_OFFSET = 1;
const ZERO_TOKENS = 0;

interface StructuredOutputResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  toolCalls: ToolCallsArray;
  structuredOutput: { nodeId: string; data: unknown };
}

interface ProcessStructuredOutputParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

function isReplyUsageInfo(value: unknown): value is ReplyUsageInfo {
  return typeof value === 'object' && value !== null;
}

function extractUsageFromResult(result: ModelCallResult): ReplyUsageInfo {
  if (isReplyUsageInfo(result.usage)) {
    return result.usage;
  }
  return { inputTokens: ZERO_TOKENS, outputTokens: ZERO_TOKENS, cachedInputTokens: ZERO_TOKENS };
}

function accumulateTokensFromResult(input: CallAgentInput, result: ModelCallResult): void {
  const lastLog = input.tokensLog.at(-LAST_INDEX_OFFSET);
  if (lastLog === undefined) return;
  const rawUsage = extractUsageFromResult(result);
  const { costUSD } = result;
  const tokenLog = { ...getTokensUsage(rawUsage), costUSD };
  accumulateTokens(lastLog.tokens, tokenLog);
}

function storeDebugMessages(
  result: ModelCallResult,
  debugMessages: Record<string, ModelMessage[][]>,
  currentNodeID: string
): void {
  const messages = result.response?.messages;
  if (messages === undefined) return;
  Object.assign(debugMessages, { [currentNodeID]: [messages] });
}

function resolveNextNodeID(config: NodeProcessingConfig): string {
  const nextNodeKeys = Object.keys(config.nodes);
  const [firstNextNode] = nextNodeKeys;
  return firstNextNode ?? '';
}

export async function processStructuredOutputNode(
  params: ProcessStructuredOutputParams
): Promise<StructuredOutputResult> {
  const { context, config, input, currentNodeID, debugMessages } = params;
  const { model } = getModel(context.apiKey);
  const zodSchema = outputSchemaToZod(config.outputSchema ?? []);
  const cleanMessages = formatMessages(input.messages, [config.promptWithoutToolPreconditions]);
  const modelConfig = getConfig({ model, cleanMessages, toolChoice: 'none' });
  const result = await callModel(context, modelConfig, {
    expectedTool: undefined,
    model,
    outputSchema: zodSchema,
  });
  const output = result.output ?? {};

  accumulateTokensFromResult(input, result);
  storeDebugMessages(result, debugMessages, currentNodeID);

  const nextNodeID = resolveNextNodeID(config);
  const parsedResult: ParsedResult = { nextNodeID, messageToUser: undefined };

  return {
    parsedResult,
    nextNodeID,
    toolCalls: [],
    structuredOutput: { nodeId: currentNodeID, data: output },
  };
}
