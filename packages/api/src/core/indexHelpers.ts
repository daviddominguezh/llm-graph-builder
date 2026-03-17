import type { AssistantModelMessage, ModelMessage } from 'ai';

import { INITIAL_STEP_NODE } from '@src/constants/index.js';
import { getNode } from '@src/stateMachine/graph/index.js';
import type { ParsedResult } from '@src/types/ai/index.js';
import type { Graph } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';

import { type TimedResult, applySuccessResult, emitResultForNode } from './flowEmitter.js';
import type { ProcessNodeParams, ToolCallsArray } from './nodeHelpers.js';
import { processNode } from './nodeHelpers.js';
import type { CallAgentInput } from './types.js';

export type { ToolCallsArray } from './nodeHelpers.js';
export { getRequiredTool } from './nodeHelpers.js';

const LAST_INDEX_OFFSET = 1;
const EMPTY_LENGTH = 0;

interface FlowState {
  currentNodeID: string;
  nodeBeforeGlobal: string;
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  allToolCalls: ToolCallsArray;
  structuredOutputs: Record<string, unknown[]>;
  newStructuredOutputs: Array<{ nodeId: string; data: unknown }>;
}

export interface FlowResult {
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  debugMessages: Record<string, ModelMessage[][]>;
  error: boolean;
  toolCalls: ToolCallsArray;
  newStructuredOutputs: Array<{ nodeId: string; data: unknown }>;
}

function isTerminalNode(context: Context, nodeID: string): boolean {
  const edges = context.graph.edges.filter((e) => e.from === nodeID);
  return edges.length === EMPTY_LENGTH;
}

async function processNodeTimed(params: ProcessNodeParams): Promise<TimedResult> {
  const startTime = Date.now();
  const result = await processNode(params);
  return { ...result, durationMs: Date.now() - startTime };
}

interface FlowStepResult {
  state: FlowState;
  error: boolean;
  shouldContinue: boolean;
  isTerminal?: boolean;
}

function advanceFlowState(context: Context, state: FlowState, nextNodeID: string): FlowStepResult {
  const { nodeBeforeGlobal, parsedResults, visitedNodes, allToolCalls } = state;
  const { global: nextNodeIsGlobal, nextNodeIsUser } = getNode(context.graph, nextNodeID);
  const newNodeBeforeGlobal = nextNodeIsGlobal ? nodeBeforeGlobal : nextNodeID;

  const newState: FlowState = {
    currentNodeID: nextNodeID,
    nodeBeforeGlobal: newNodeBeforeGlobal,
    parsedResults,
    visitedNodes,
    allToolCalls,
    structuredOutputs: state.structuredOutputs,
    newStructuredOutputs: state.newStructuredOutputs,
  };

  return { state: newState, error: false, shouldContinue: nextNodeIsUser !== true, isTerminal: false };
}

function lastResultHasMessage(parsedResults: ParsedResult[]): boolean {
  const [last] = parsedResults.slice(-LAST_INDEX_OFFSET);
  return last?.messageToUser !== undefined && last.messageToUser !== '';
}

interface NodeHandlerParams {
  context: Context;
  input: CallAgentInput;
  nodeId: string;
  result: TimedResult;
}

function handleNodeSuccess(params: NodeHandlerParams, state: FlowState): void {
  const { context, input, nodeId, result } = params;
  emitResultForNode({ context, input, nodeId, result });
  applySuccessResult(state.allToolCalls, result, state.structuredOutputs, state.newStructuredOutputs);
}

function handleNodeError(params: NodeHandlerParams): void {
  const { context, input, nodeId, result } = params;
  emitResultForNode({
    context,
    input,
    nodeId,
    result,
    errorOverride: result.errorMessage ?? 'Node processing failed',
  });
}

async function executeTerminalNode(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<FlowStepResult> {
  const { currentNodeID, nodeBeforeGlobal, parsedResults, visitedNodes } = state;
  visitedNodes.push(currentNodeID);
  context.onNodeVisited?.(currentNodeID);

  if (lastResultHasMessage(parsedResults)) {
    return { state, error: false, shouldContinue: false, isTerminal: true };
  }

  const result = await processNodeTimed({
    context,
    input,
    currentNodeID,
    nodeBeforeGlobal,
    debugMessages,
    structuredOutputs: state.structuredOutputs,
  });

  if (result.error) {
    handleNodeError({ context, input, nodeId: currentNodeID, result });
    return { state, error: true, shouldContinue: false };
  }

  handleNodeSuccess({ context, input, nodeId: currentNodeID, result }, state);
  parsedResults.push(result.parsedResult);
  return { state, error: false, shouldContinue: false, isTerminal: true };
}

async function processFlowStep(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<FlowStepResult> {
  const { currentNodeID, nodeBeforeGlobal, parsedResults, visitedNodes } = state;

  if (isTerminalNode(context, currentNodeID)) {
    return await executeTerminalNode(context, input, debugMessages, state);
  }

  visitedNodes.push(currentNodeID);
  context.onNodeVisited?.(currentNodeID);

  const result = await processNodeTimed({
    context,
    input,
    currentNodeID,
    nodeBeforeGlobal,
    debugMessages,
    structuredOutputs: state.structuredOutputs,
  });

  if (result.error) {
    handleNodeError({ context, input, nodeId: currentNodeID, result });
    return { state, error: true, shouldContinue: false };
  }

  handleNodeSuccess({ context, input, nodeId: currentNodeID, result }, state);
  const { parsedResult, nextNodeID } = result;
  parsedResult.nextNodeID = nextNodeID;
  parsedResults.push(parsedResult);
  return advanceFlowState(context, state, nextNodeID);
}

function appendLastVisitedNode(parsedResults: ParsedResult[], visitedNodes: string[]): void {
  const [lastParsedResult] = parsedResults.slice(-LAST_INDEX_OFFSET);
  if (lastParsedResult !== undefined) {
    visitedNodes.push(lastParsedResult.nextNodeID);
  }
}

function buildFlowResult(
  state: FlowState,
  debugMessages: Record<string, ModelMessage[][]>,
  error: boolean,
  isTerminal?: boolean
): FlowResult {
  const { parsedResults, visitedNodes, allToolCalls, newStructuredOutputs } = state;
  if (isTerminal !== true && !error) appendLastVisitedNode(parsedResults, visitedNodes);
  return { parsedResults, visitedNodes, debugMessages, error, toolCalls: allToolCalls, newStructuredOutputs };
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
    isTerminal,
  } = await processFlowStep(context, input, debugMessages, state);

  if (error || !shouldContinue) {
    return buildFlowResult(newState, debugMessages, error, isTerminal);
  }

  return await executeAgentFlowRecursive(context, input, debugMessages, newState);
}

const SINGLE_EDGE = 1;

function resolveStartNode(graph: Graph, nodeId: string): string {
  if (nodeId !== INITIAL_STEP_NODE) return nodeId;
  const edgesFromInitial = graph.edges.filter((e) => e.from === INITIAL_STEP_NODE);
  const [firstEdge] = edgesFromInitial;
  if (edgesFromInitial.length === SINGLE_EDGE) {
    return firstEdge?.to ?? nodeId;
  }
  return nodeId;
}

export function createInitialFlowState(input: CallAgentInput, graph: Graph): FlowState {
  const startNode = resolveStartNode(graph, input.currentNode);
  return {
    currentNodeID: startNode,
    nodeBeforeGlobal: startNode,
    parsedResults: [],
    visitedNodes: [],
    allToolCalls: [],
    structuredOutputs: { ...input.structuredOutputs },
    newStructuredOutputs: [],
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
