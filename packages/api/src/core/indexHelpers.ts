import type { AssistantModelMessage, ModelMessage, Tool, ToolChoice, ToolSet, TypedToolCall } from 'ai';

import { getEdgesFromNode, getNode } from '@src/stateMachine/graph/index.js';
import { buildNextAgentConfig } from '@src/stateMachine/index.js';
import type { ParsedResult } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { AGENT_CONSTANTS } from './constants.js';
import { MessageProcessor } from './messageProcessor.js';
import { buildFAQConfig, processReplyNode, processToolNode } from './nodeProcessor.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

const FIRST_INDEX = 0;
const LAST_INDEX_OFFSET = 1;
const EMPTY_LENGTH = 0;

export type ToolCallsArray = Array<TypedToolCall<Record<string, Tool>>>;

/**
 * Extracts the required tool name from tool choice
 */
export function getRequiredTool(toolChoice?: ToolChoice<NoInfer<ToolSet>>): string | undefined {
  if (toolChoice === undefined || typeof toolChoice === 'string') return undefined;
  return toolChoice.toolName;
}

interface ProcessNodeParams {
  context: Context;
  input: CallAgentInput;
  currentNodeID: string;
  nodeBeforeFAQ: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface ProcessNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
}

async function getNodeConfig(
  context: Context,
  currentNodeID: string,
  nodeBeforeFAQ: string
): Promise<NodeProcessingConfig> {
  const isFAQ = currentNodeID === AGENT_CONSTANTS.FAQ_NODE_NAME;

  // TODO: Replace everything "FAQ" for "global nodes"
  if (isFAQ) return buildFAQConfig(context, nodeBeforeFAQ);

  return await buildNextAgentConfig(context.graph, context, currentNodeID);
}

async function applyJumpTo(context: Context, currentNodeID: string, nextNodeID: string): Promise<string> {
  const edges = await getEdgesFromNode(context.graph, context, currentNodeID);
  const selectedEdge = edges.find((edge) => edge.to === nextNodeID);
  const jumpTo = selectedEdge?.contextPreconditions?.jumpTo;

  if (jumpTo !== undefined && jumpTo !== '') {
    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| JumpTo detected: ${nextNodeID} -> ${jumpTo}`
    );
    return jumpTo;
  }

  return nextNodeID;
}

async function processToolCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig,
  isFAQ: boolean
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;
  const edgeValues = Object.values(config.toolsByEdge);
  const [firstEdge] = edgeValues;
  const requiredTool = getRequiredTool(firstEdge?.toolChoice);

  const result = await processToolNode({
    context,
    config,
    input,
    currentNodeID,
    requiredTool,
    isFAQ,
    debugMessages,
  });

  if (result.error) {
    return result;
  }

  const finalNextNodeID = await applyJumpTo(context, currentNodeID, result.nextNodeID);
  return { ...result, nextNodeID: finalNextNodeID };
}

async function processReplyCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;

  const result = await processReplyNode({ context, config, input, currentNodeID, debugMessages });
  const finalNextNodeID = await applyJumpTo(context, currentNodeID, result.nextNodeID);

  return { ...result, nextNodeID: finalNextNodeID, error: false };
}

/**
 * Processes a single node in the agent flow
 */
export async function processNode(params: ProcessNodeParams): Promise<ProcessNodeResult> {
  const { context, currentNodeID, nodeBeforeFAQ } = params;
  const isFAQ = currentNodeID === AGENT_CONSTANTS.FAQ_NODE_NAME;

  const config = await getNodeConfig(context, currentNodeID, nodeBeforeFAQ);

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| Kind: ${config.kind}`);
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| PROMPT:\n${config.promptWithoutToolPreconditions}\n`
  );

  if (config.kind === 'tool_call') {
    return await processToolCallNode(params, config, isFAQ);
  }

  return await processReplyCallNode(params, config);
}

interface FlowState {
  currentNodeID: string;
  nodeBeforeFAQ: string;
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  allToolCalls: ToolCallsArray;
}

export interface FlowResult {
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  debugMessages: Record<string, ModelMessage[][]>;
  error: boolean;
  toolCalls: ToolCallsArray;
}

async function processFlowStep(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<{ state: FlowState; error: boolean; shouldContinue: boolean }> {
  const { currentNodeID, nodeBeforeFAQ, parsedResults, visitedNodes, allToolCalls } = state;
  visitedNodes.push(currentNodeID);

  const { parsedResult, nextNodeID, error, toolCalls } = await processNode({
    context,
    input,
    currentNodeID,
    nodeBeforeFAQ,
    debugMessages,
  });

  if (error) {
    return { state, error: true, shouldContinue: false };
  }

  if (toolCalls.length > EMPTY_LENGTH) {
    allToolCalls.push(...toolCalls);
  }

  const nextNodeIsFAQ = nextNodeID === AGENT_CONSTANTS.FAQ_NODE_NAME;
  const newNodeBeforeFAQ = nextNodeIsFAQ ? nodeBeforeFAQ : nextNodeID;

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| nextNode: ${nextNodeID}`);

  const currentNode = getNode(context.graph, nextNodeID);
  const nextNodeIsUser = currentNode.nextNodeIsUser === true;

  parsedResult.nextNodeID = nextNodeID;
  parsedResults.push(parsedResult);

  const newState: FlowState = {
    currentNodeID: nextNodeID,
    nodeBeforeFAQ: newNodeBeforeFAQ,
    parsedResults,
    visitedNodes,
    allToolCalls,
  };

  return { state: newState, error: false, shouldContinue: !nextNodeIsUser };
}

/**
 * Executes the agent flow through multiple nodes using recursion
 */
export async function executeAgentFlowRecursive(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<FlowResult> {
  const {
    state: newState,
    error,
    shouldContinue,
  } = await processFlowStep(context, input, debugMessages, state);

  if (error) {
    return {
      parsedResults: newState.parsedResults,
      visitedNodes: newState.visitedNodes,
      debugMessages,
      error: true,
      toolCalls: newState.allToolCalls,
    };
  }

  if (!shouldContinue) {
    const { parsedResults, visitedNodes, allToolCalls } = newState;
    const [lastParsedResult] = parsedResults.slice(-LAST_INDEX_OFFSET);
    if (lastParsedResult !== undefined) {
      visitedNodes.push(lastParsedResult.nextNodeID);
    }

    return { parsedResults, visitedNodes, debugMessages, error: false, toolCalls: allToolCalls };
  }

  return await executeAgentFlowRecursive(context, input, debugMessages, newState);
}

export function createInitialFlowState(input: CallAgentInput): FlowState {
  return {
    currentNodeID: input.currentNode,
    nodeBeforeFAQ: input.currentNode,
    parsedResults: [],
    visitedNodes: [],
    allToolCalls: [],
  };
}

export function extractLastMessage(input: CallAgentInput): AssistantModelMessage | null {
  const { messages } = input;
  const [lastMessage] = messages.slice(messages.length - LAST_INDEX_OFFSET);
  if (lastMessage === undefined) return null;
  const { message } = lastMessage;
  if (message.role === 'assistant') return message;
  return null;
}
