import type { ModelMessage } from 'ai';

import { formatMessages } from '@globalUtils/ai/messages.js';

import { TEXT_FEATURE_ACTION, TEXT_FEATURE_MODEL } from '@src/ai/index.js';

import type { Context } from '@src/types/ai/tools.js';
import type { Message } from '@src/types/messages/aiMessages.js';

import { executeAgent } from './agentExecutor.js';
import { getConfig } from './config.js';
import { MessageProcessor } from './messageProcessor.js';
import {
  type ManualInvokeResult,
  type ToolCallsArray,
  getProviderFromMessages,
  manuallyInvokeAnswerBusinessQuestion,
} from './nodeProcessorHelpers.js';
import { accumulateTokens } from './tokenTracker.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

export interface ProcessToolNodeParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  requiredTool: string | undefined;
  isFAQ: boolean;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface ToolsFromConfig {
  tools: NodeProcessingConfig['toolsByEdge'][string]['tools'] | undefined;
  toolChoice: NodeProcessingConfig['toolsByEdge'][string]['toolChoice'] | undefined;
}

function getCallAgentModel(): ReturnType<
  (typeof TEXT_FEATURE_MODEL)[keyof typeof TEXT_FEATURE_MODEL]['getter']
> {
  const { [TEXT_FEATURE_ACTION.CALL_AGENT as keyof typeof TEXT_FEATURE_MODEL]: featureModel } =
    TEXT_FEATURE_MODEL;
  return featureModel.getter();
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

async function handleFAQFallback(
  context: Context,
  config: NodeProcessingConfig,
  input: CallAgentInput,
  provider: Message['provider']
): Promise<ManualInvokeResult | null> {
  const manualResult = await manuallyInvokeAnswerBusinessQuestion(context, config, input.messages);
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
  const { model } = getCallAgentModel();
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
  const [toolFirstTokenLog] = toolTokensLog;
  if (toolFirstTokenLog !== undefined) {
    accumulateTokens(toolFirstTokenLog.tokens, agentRes.tokens);
  }
  Object.assign(debugMessages, { [currentNodeID]: agentRes.copyMsgs });
}

async function handleFAQFallbackIfNeeded(
  params: ProcessToolNodeParams,
  hasError: boolean,
  initialToolCalls: ToolCallsArray
): Promise<{ hasError: boolean; finalToolCalls: ToolCallsArray }> {
  const { context, config, input, isFAQ } = params;

  if (!hasError || !isFAQ) {
    return { hasError, finalToolCalls: initialToolCalls };
  }

  const provider = getProviderFromMessages(input.messages);
  const fallbackResult = await handleFAQFallback(context, config, input, provider);
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
  const { hasError, finalToolCalls } = await handleFAQFallbackIfNeeded(
    params,
    initialError,
    initialToolCalls
  );

  return { agentRes, hasError, finalToolCalls };
}
