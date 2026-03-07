import type { ModelMessage } from 'ai';

import { getNode, getToolsFromEdges } from '@src/stateMachine/graph/index.js';
import { generateToolReplyPrompt } from '@src/stateMachine/prompts/index.js';
import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { formatMessages } from '@src/utils/messages.js';

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

function getCallAgentModel(): ReturnType<
  (typeof TEXT_FEATURE_MODEL)[keyof typeof TEXT_FEATURE_MODEL]['getter']
> {
  const { [TEXT_FEATURE_ACTION.CALL_AGENT as keyof typeof TEXT_FEATURE_MODEL]: featureModel } =
    TEXT_FEATURE_MODEL;
  return featureModel.getter();
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
  const { model } = getCallAgentModel();

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

async function generateProductsShownPrompt(context: Context): Promise<string | null> {
  if (context.isTest === true) return null;

  const productsShown = await getProductsHaveAlreadyBeenShown(context.tenantID, context.userID);
  if (isProductsEmpty(productsShown)) return null;

  const productList = productsShown.map((id) => `- ${id}`).join('\n');
  return `\n\nPRODUCTS ALREADY SHOWN TO USER:\nThe following product IDs have already been shown to this user in previous interactions:\n${productList}\n\nYou may reference these products when responding to the user.`;
}

export async function addNodeSpecificPrompts(
  context: Context,
  currentNodeID: string,
  replyPrompt: string
): Promise<string> {
  let prompt = replyPrompt;

  if (currentNodeID === AGENT_CONSTANTS.USER_SPECIFIED_NAME_NODE) {
    const fetchedOrders =
      context.isTest === true ? null : await getUserOrders(context.tenantID, context.userID);
    const orders = fetchedOrders ?? [];
    if (orders.length === EMPTY_LENGTH) prompt += PROMPTS.NO_ORDERS_WARNING;
  }

  if (AGENT_CONSTANTS.PRODUCTS_SHOWN_HISTORY.includes(currentNodeID)) {
    const productsPrompt = await generateProductsShownPrompt(context);
    if (productsPrompt !== null) prompt += productsPrompt;
  }

  // For CustomLink node, prevent hallucination of products not in cart
  if (AGENT_CONSTANTS.CUSTOMIZATION_LINK_NODES.includes(currentNodeID)) {
    prompt += PROMPTS.NO_PRODUCT_LISTING_IN_CUSTOMIZATION;
  }

  return prompt;
}

async function generateToolReply(params: GenerateToolReplyParams): Promise<ParsedResult> {
  const { context, input, currentNodeID, nextNodeID, nodes, isFAQ, debugMessages } = params;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getCallAgentModel();
  const nextNode = getNode(nextNodeID);

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
  const nextNode = getNode(nextNodeID);

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
