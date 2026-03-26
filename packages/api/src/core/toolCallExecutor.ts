import type { ModelMessage } from 'ai';

import type { Message } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { formatMessages } from '@src/utils/messages.js';

import { executeAgent } from './agentExecutor.js';
import { getModel } from './agentExecutorHelpers.js';
import { getConfig } from './config.js';
import { MessageProcessor } from './messageProcessor.js';
import {
  type ManualInvokeResult,
  type ToolCallsArray,
  getProviderFromMessages,
  manuallyInvokeGlobalNodeTool,
} from './nodeProcessorHelpers.js';
import { accumulateTokens } from './tokenTracker.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

const LAST_INDEX_OFFSET = 1;

export interface ProcessToolNodeParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  requiredTool: string | undefined;
  isGlobal: boolean;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface ToolsFromConfig {
  tools: NodeProcessingConfig['toolsByEdge'][string]['tools'] | undefined;
  toolChoice: NodeProcessingConfig['toolsByEdge'][string]['toolChoice'] | undefined;
}

function getToolsFromConfig(config: NodeProcessingConfig): ToolsFromConfig {
  const edgeValues = Object.values(config.toolsByEdge);
  const [firstEdge] = edgeValues;
  if (firstEdge === undefined) {
    return { tools: undefined, toolChoice: undefined };
  }
  const { tools, toolChoice } = firstEdge;
  return { tools, toolChoice };
}

async function handleGlobalNodeFallback(
  context: Context,
  config: NodeProcessingConfig,
  input: CallAgentInput,
  provider: Message['provider']
): Promise<ManualInvokeResult | null> {
  const manualResult = await manuallyInvokeGlobalNodeTool(context, config, input.messages);
  if (!manualResult.success) return null;

  const queryMsgs = MessageProcessor.convertToAppMessages(manualResult.messages, provider);
  input.messages.push(...queryMsgs);
  return manualResult;
}

interface ExecuteAgentCallParams {
  params: ProcessToolNodeParams;
}

async function executeAgentCall(
  executeParams: ExecuteAgentCallParams
): Promise<Awaited<ReturnType<typeof executeAgent>>> {
  const { params } = executeParams;
  const { context, config, input, currentNodeID, requiredTool } = params;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getModel(context.apiKey, context.modelId);
  const { promptWithoutToolPreconditions } = config;
  const { tools, toolChoice } = getToolsFromConfig(config);

  const cleanMessages = formatMessages(input.messages, [promptWithoutToolPreconditions]);
  const modelConfig = getConfig({
    model,
    cleanMessages,
    tools,
    toolChoice: toolChoice ?? 'none',
    kind: config.kind,
  });

  return await executeAgent({
    context,
    provider,
    config: modelConfig,
    messages: input.messages,
    step: currentNodeID,
    expectedTool: requiredTool,
  });
}

function trackAgentTokens(
  params: ProcessToolNodeParams,
  agentRes: Awaited<ReturnType<typeof executeAgent>>
): void {
  const { input, currentNodeID, debugMessages } = params;
  const { tokensLog: toolTokensLog } = input;
  const toolLastTokenLog = toolTokensLog.at(-LAST_INDEX_OFFSET);
  if (toolLastTokenLog !== undefined) {
    accumulateTokens(toolLastTokenLog.tokens, agentRes.tokens);
  }
  Object.assign(debugMessages, { [currentNodeID]: agentRes.copyMsgs });
}

async function handleGlobalNodeFallbackIfNeeded(
  params: ProcessToolNodeParams,
  hasError: boolean,
  initialToolCalls: ToolCallsArray
): Promise<{ hasError: boolean; finalToolCalls: ToolCallsArray }> {
  const { context, config, input, isGlobal } = params;

  if (!hasError || !isGlobal) {
    return { hasError, finalToolCalls: initialToolCalls };
  }

  const provider = getProviderFromMessages(input.messages);
  const fallbackResult = await handleGlobalNodeFallback(context, config, input, provider);
  if (fallbackResult === null) {
    return { hasError, finalToolCalls: initialToolCalls };
  }

  const { toolCalls: fallbackToolCalls } = fallbackResult;
  return { hasError: false, finalToolCalls: fallbackToolCalls };
}

export interface ExecuteToolCallResult {
  agentRes: Awaited<ReturnType<typeof executeAgent>>;
  hasError: boolean;
  finalToolCalls: ToolCallsArray;
}

export async function executeToolCall(params: ProcessToolNodeParams): Promise<ExecuteToolCallResult> {
  const agentRes = await executeAgentCall({ params });
  trackAgentTokens(params, agentRes);

  const { error: initialError, toolCalls: initialToolCalls } = agentRes;
  const { hasError, finalToolCalls } = await handleGlobalNodeFallbackIfNeeded(
    params,
    initialError,
    initialToolCalls
  );

  return { agentRes, hasError, finalToolCalls };
}
