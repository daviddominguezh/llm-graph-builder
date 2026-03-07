import type { ModelMessage } from 'ai';

import { getNode, getToolsFromEdges } from '@src/stateMachine/graph/index.js';
import { generateToolReplyPrompt } from '@src/stateMachine/prompts/index.js';
import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { formatMessages } from '@src/utils/messages.js';

import { getModel } from './agentExecutorHelpers.js';
import { getConfig } from './config.js';
import { AGENT_CONSTANTS, PROMPTS } from './constants.js';
import { type ToolCallsArray, getProviderFromMessages, isProductsEmpty } from './nodeProcessorHelpers.js';
import { generateReply } from './replyGenerator.js';
import { accumulateTokens } from './tokenTracker.js';
import { type ProcessToolNodeParams, executeToolCall } from './toolCallExecutor.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

const EMPTY_LENGTH = 0;

interface ProcessReplyNodeParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface GenerateToolReplyParams {
  context: Context;
  input: CallAgentInput;
  currentNodeID: string;
  nextNodeID: string;
  nodes: Record<string, string>;
  isFAQ: boolean;
  debugMessages: Record<string, ModelMessage[][]>;
}

export function buildFAQConfig(context: Context, nodeBeforeFAQ: string): NodeProcessingConfig {
  const { FAQ_NODE_NAME, INITIAL_STEP, DEFAULT_OUTPUT_NODE } = AGENT_CONSTANTS;
  const targetNode = nodeBeforeFAQ === INITIAL_STEP ? INITIAL_STEP : nodeBeforeFAQ;

  return {
    kind: 'tool_call' as const,
    // TODO: FAQ must change for global nodes
    promptWithoutToolPreconditions: PROMPTS.FAQ_MUST_CALL_TOOL(CloserTool.answerBusinessQuestion),
    toolsByEdge: getToolsFromEdges(context, [
      {
        from: FAQ_NODE_NAME,
        to: targetNode,
        preconditions: [{ type: 'tool_call', value: CloserTool.answerBusinessQuestion }],
      },
    ]),
    nodes: { [DEFAULT_OUTPUT_NODE]: nodeBeforeFAQ },
  };
}

export async function processReplyNode(
  params: ProcessReplyNodeParams
): Promise<{ parsedResult: ParsedResult; nextNodeID: string; toolCalls: ToolCallsArray }> {
  const { context, config, input, currentNodeID, debugMessages } = params;
  const { promptWithoutToolPreconditions, nodes } = config;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getModel();

  const cleanMessages = formatMessages(input.messages, [promptWithoutToolPreconditions]);
  const modelConfig = getConfig({ model, cleanMessages, toolChoice: 'none' });

  const res = await generateReply({
    context,
    provider,
    config: modelConfig,
    messages: input.messages,
    step: currentNodeID,
    nodes,
  });
  const { tokensLog } = input;
  const [firstTokenLog] = tokensLog;
  if (firstTokenLog !== undefined) {
    accumulateTokens(firstTokenLog.tokens, res.tokens);
  }
  Object.assign(debugMessages, { [currentNodeID]: res.copyMsgs });

  const { [res.result.nextNodeID]: nextNodeID } = nodes;
  return { parsedResult: res.result, nextNodeID: nextNodeID ?? '', toolCalls: res.toolCalls };
}

export function addNodeSpecificPrompts(context: Context, currentNodeID: string, replyPrompt: string): string {
  const prompt = replyPrompt;
  // TODO: Extract this from the graph -> each node can have an optional "prompt" field
  return prompt;
}

async function generateToolReply(params: GenerateToolReplyParams): Promise<ParsedResult> {
  const { context, input, currentNodeID, nextNodeID, nodes, isFAQ, debugMessages } = params;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getModel();
  const nextNode = getNode(context.graph, nextNodeID);

  let replyPrompt = await generateToolReplyPrompt({
    ctx: context,
    nodeId: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE,
    nodeName: nextNode.id,
    textExample: nextNode.text,
    description: nextNode.description,
  });
  if (isFAQ) replyPrompt += PROMPTS.FAQ_REPLY_SUFFIX;
  replyPrompt = await addNodeSpecificPrompts(context, currentNodeID, replyPrompt);

  const replyConfig = getConfig({
    model,
    cleanMessages: formatMessages(input.messages, [replyPrompt]),
    toolChoice: 'none',
  });
  const replyRes = await generateReply({
    context,
    provider,
    config: replyConfig,
    messages: input.messages,
    step: currentNodeID,
    nodes,
    nextNodeKnown: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE,
  });

  const { tokensLog: replyTokensLog } = input;
  const [replyFirstTokenLog] = replyTokensLog;
  if (replyFirstTokenLog !== undefined) {
    accumulateTokens(replyFirstTokenLog.tokens, replyRes.tokens);
  }
  Object.assign(debugMessages, {
    [`${currentNodeID}${AGENT_CONSTANTS.AFTER_TOOL_REPLY_SUFFIX}`]: replyRes.copyMsgs,
  });

  return { ...replyRes.result, nextNodeID: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE };
}

interface ToolNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
}

function createErrorResult(): ToolNodeResult {
  return { parsedResult: { nextNodeID: '' }, nextNodeID: '', error: true, toolCalls: [] };
}

export async function processToolNode(params: ProcessToolNodeParams): Promise<ToolNodeResult> {
  const { context, config, input, currentNodeID, isFAQ, debugMessages, requiredTool } = params;
  const { toolsByEdge, nodes } = config;

  const toolsByEdgeKeys = Object.keys(toolsByEdge);
  const [firstNextNodeID] = toolsByEdgeKeys;
  if (firstNextNodeID === undefined) {
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| No edges found in toolsByEdge`);
    return createErrorResult();
  }

  const nextNodeID = firstNextNodeID;
  const nextNode = getNode(context.graph, nextNodeID);

  const { hasError, finalToolCalls } = await executeToolCall(params);

  if (hasError) {
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| Tool node failed`, {
      currentNodeID,
      requiredTool: requiredTool ?? 'none',
    });
    return createErrorResult();
  }

  const shouldGenerateReply = nextNode.nextNodeIsUser === true || isFAQ;
  const parsedResult: ParsedResult = shouldGenerateReply
    ? await generateToolReply({ context, input, currentNodeID, nextNodeID, nodes, isFAQ, debugMessages })
    : { nextNodeID: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE };

  const { [parsedResult.nextNodeID]: finalNextNodeID } = nodes;
  return { parsedResult, nextNodeID: finalNextNodeID ?? '', error: false, toolCalls: finalToolCalls };
}
