import type { AssistantModelMessage, ModelMessage, Tool, ToolChoice, ToolSet, TypedToolCall } from 'ai';

import { INITIAL_STEP_NODE } from '@src/constants/index.js';
import { getEdgesFromNode, getNode } from '@src/stateMachine/graph/index.js';
import { buildNextAgentConfig } from '@src/stateMachine/index.js';
import type { ParsedResult } from '@src/types/ai/index.js';
import type { Graph } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { buildGlobalNodeConfig, processReplyNode, processToolNode } from './nodeProcessor.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

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
  nodeBeforeGlobal: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface ProcessNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
}

function isGlobalNode(context: Context, nodeID: string): boolean {
  const node = getNode(context.graph, nodeID);
  return node.global;
}

async function getNodeConfig(
  context: Context,
  currentNodeID: string,
  nodeBeforeGlobal: string
): Promise<NodeProcessingConfig> {
  const isGlobal = isGlobalNode(context, currentNodeID);

  if (isGlobal) return buildGlobalNodeConfig(context, nodeBeforeGlobal, currentNodeID);

  return await buildNextAgentConfig(context.graph, context, currentNodeID, {
    toolsOverride: context.toolsOverride,
  });
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
  isGlobal: boolean
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
    isGlobal,
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
  const { context, currentNodeID, nodeBeforeGlobal } = params;
  const isGlobal = isGlobalNode(context, currentNodeID);

  const config = await getNodeConfig(context, currentNodeID, nodeBeforeGlobal);

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| Kind: ${config.kind}`);
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| PROMPT:\n${config.promptWithoutToolPreconditions}\n`
  );

  if (config.kind === 'tool_call') {
    return await processToolCallNode(params, config, isGlobal);
  }

  return await processReplyCallNode(params, config);
}

interface FlowState {
  currentNodeID: string;
  nodeBeforeGlobal: string;
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
  const { currentNodeID, nodeBeforeGlobal, parsedResults, visitedNodes, allToolCalls } = state;
  logger.info(`[FLOW] Processing node: ${currentNodeID}, visitedSoFar: [${visitedNodes.join(', ')}]`);
  visitedNodes.push(currentNodeID);
  context.onNodeVisited?.(currentNodeID);

  const { parsedResult, nextNodeID, error, toolCalls } = await processNode({
    context,
    input,
    currentNodeID,
    nodeBeforeGlobal,
    debugMessages,
  });

  logger.info(`[FLOW] processNode returned: nextNodeID=${nextNodeID}, error=${String(error)}, toolCalls=${toolCalls.length}`);
  logger.info(`[FLOW] parsedResult: ${JSON.stringify(parsedResult)}`);

  if (error) {
    logger.info('[FLOW] Error in processNode, stopping flow');
    return { state, error: true, shouldContinue: false };
  }

  if (toolCalls.length > EMPTY_LENGTH) {
    allToolCalls.push(...toolCalls);
  }

  const { global: nextNodeIsGlobal, nextNodeIsUser } = getNode(context.graph, nextNodeID);
  const newNodeBeforeGlobal = nextNodeIsGlobal ? nodeBeforeGlobal : nextNodeID;

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| nextNode: ${nextNodeID}`);

  parsedResult.nextNodeID = nextNodeID;
  parsedResults.push(parsedResult);

  const newState: FlowState = {
    currentNodeID: nextNodeID,
    nodeBeforeGlobal: newNodeBeforeGlobal,
    parsedResults,
    visitedNodes,
    allToolCalls,
  };

  return { state: newState, error: false, shouldContinue: nextNodeIsUser !== true };
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

function resolveStartNode(graph: Graph, nodeId: string): string {
  if (nodeId !== INITIAL_STEP_NODE) return nodeId;
  const edgesFromInitial = graph.edges.filter((e) => e.from === INITIAL_STEP_NODE);
  const [firstEdge] = edgesFromInitial;
  return firstEdge?.to ?? nodeId;
}

export function createInitialFlowState(input: CallAgentInput, graph: Graph): FlowState {
  const startNode = resolveStartNode(graph, input.currentNode);
  return {
    currentNodeID: startNode,
    nodeBeforeGlobal: startNode,
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
