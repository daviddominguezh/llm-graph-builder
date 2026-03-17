import type { AssistantModelMessage, ModelMessage } from 'ai';

import { INITIAL_STEP_NODE } from '@src/constants/index.js';
import { getNode } from '@src/stateMachine/graph/index.js';
import type { ParsedResult } from '@src/types/ai/index.js';
import type { Graph } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';
import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

import type { ProcessNodeParams, ProcessNodeResult, ToolCallsArray } from './nodeHelpers.js';
import { processNode } from './nodeHelpers.js';
import { createEmptyTokenLog } from './tokenTracker.js';
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

interface EmitNodeProcessedParams {
  context: Context;
  input: CallAgentInput;
  nodeId: string;
  parsedResult: ParsedResult;
  toolCalls: ToolCallsArray;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };
}

function resolveOutput(
  parsedResult: ParsedResult,
  structuredOutput?: { nodeId: string; data: unknown }
): unknown {
  if (structuredOutput !== undefined) return structuredOutput.data;
  return parsedResult;
}

function emitNodeProcessed(params: EmitNodeProcessedParams): void {
  const { context, input, nodeId, parsedResult, toolCalls, durationMs, structuredOutput } = params;
  if (context.onNodeProcessed === undefined) return;
  const lastLog = input.tokensLog.at(-LAST_INDEX_OFFSET);
  const tokens = lastLog?.tokens ?? createEmptyTokenLog();
  context.onNodeProcessed({
    nodeId,
    text: parsedResult.messageToUser,
    output: resolveOutput(parsedResult, structuredOutput),
    toolCalls,
    tokens,
    durationMs,
    structuredOutput,
  });
}

function isTerminalNode(context: Context, nodeID: string): boolean {
  const edges = context.graph.edges.filter((e) => e.from === nodeID);
  return edges.length === EMPTY_LENGTH;
}

async function processNodeTimed(
  params: ProcessNodeParams
): Promise<ProcessNodeResult & { durationMs: number }> {
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

function mergeStructuredOutputEntry(outputs: Record<string, unknown[]>, nodeId: string, data: unknown): void {
  const existing = outputs[nodeId] ?? [];
  const hash = stableJsonStringify(data);
  const alreadyExists = existing.some((e) => stableJsonStringify(e) === hash);
  if (!alreadyExists) {
    Object.assign(outputs, { [nodeId]: [...existing, data] });
  }
}

function accumulateStructuredOutput(
  state: FlowState,
  structuredOutput: { nodeId: string; data: unknown } | undefined
): void {
  if (structuredOutput === undefined) return;
  const { nodeId, data } = structuredOutput;
  mergeStructuredOutputEntry(state.structuredOutputs, nodeId, data);
  state.newStructuredOutputs.push(structuredOutput);
}

function lastResultHasMessage(parsedResults: ParsedResult[]): boolean {
  const [last] = parsedResults.slice(-LAST_INDEX_OFFSET);
  return last?.messageToUser !== undefined && last.messageToUser !== '';
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

  if (result.error) return { state, error: true, shouldContinue: false };

  const { parsedResult, toolCalls, durationMs, structuredOutput } = result;
  emitNodeProcessed({
    context,
    input,
    nodeId: currentNodeID,
    parsedResult,
    toolCalls,
    durationMs,
    structuredOutput,
  });
  if (toolCalls.length > EMPTY_LENGTH) state.allToolCalls.push(...toolCalls);
  accumulateStructuredOutput(state, structuredOutput);
  parsedResults.push(parsedResult);
  return { state, error: false, shouldContinue: false, isTerminal: true };
}

async function processFlowStep(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<FlowStepResult> {
  const { currentNodeID, nodeBeforeGlobal, parsedResults, visitedNodes, allToolCalls } = state;

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

  if (result.error) return { state, error: true, shouldContinue: false };

  const { parsedResult, nextNodeID, toolCalls, durationMs, structuredOutput } = result;
  emitNodeProcessed({
    context,
    input,
    nodeId: currentNodeID,
    parsedResult,
    toolCalls,
    durationMs,
    structuredOutput,
  });
  if (toolCalls.length > EMPTY_LENGTH) allToolCalls.push(...toolCalls);
  accumulateStructuredOutput(state, structuredOutput);

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

  if (error) {
    return {
      parsedResults: newState.parsedResults,
      visitedNodes: newState.visitedNodes,
      debugMessages,
      error: true,
      toolCalls: newState.allToolCalls,
      newStructuredOutputs: newState.newStructuredOutputs,
    };
  }

  if (!shouldContinue) {
    const { parsedResults, visitedNodes, allToolCalls, newStructuredOutputs } = newState;
    if (isTerminal !== true) appendLastVisitedNode(parsedResults, visitedNodes);
    return {
      parsedResults,
      visitedNodes,
      debugMessages,
      error: false,
      toolCalls: allToolCalls,
      newStructuredOutputs,
    };
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
