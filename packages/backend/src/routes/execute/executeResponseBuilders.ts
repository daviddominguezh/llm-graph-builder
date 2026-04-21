import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import { sumTokens, sumTotalCost } from './executeHelpers.js';
import type { AgentAppResponse, AgentExecutionResponse, WorkflowExecutionResponse } from './executeTypes.js';

const LAST_INDEX_OFFSET = 1;
const ZERO = 0;

export function getLastVisitedNode(result: CallAgentOutput, fallback: string): string {
  const { visitedNodes } = result;
  return visitedNodes[visitedNodes.length - LAST_INDEX_OFFSET] ?? fallback;
}

function buildToolCalls(result: CallAgentOutput): AgentAppResponse['toolCalls'] {
  return result.toolCalls.map((tc) => ({
    name: tc.toolName,
    args: tc.input as unknown,
    result: undefined,
  }));
}

function buildTokenUsage(result: CallAgentOutput): AgentAppResponse['tokenUsage'] {
  const tokens = sumTokens(result);
  return {
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cachedTokens: tokens.cached,
    totalCost: sumTotalCost(result),
  };
}

export function buildWorkflowResponse(
  result: CallAgentOutput,
  durationMs: number
): WorkflowExecutionResponse {
  return {
    appType: 'workflow',
    text: result.text ?? '',
    currentNodeId: getLastVisitedNode(result, ''),
    visitedNodes: result.visitedNodes,
    toolCalls: buildToolCalls(result),
    structuredOutputs: buildStructuredOutputsMap(result),
    tokenUsage: buildTokenUsage(result),
    durationMs,
  };
}

const FIRST_SEEN = 0;
const INCREMENT = 1;
const FIRST_REPEAT = 2;

function buildOutputKey(nodeId: string, seen: number): string {
  if (seen === FIRST_SEEN) return nodeId;
  return `${nodeId}-${String(seen + FIRST_REPEAT - INCREMENT)}`;
}

function buildStructuredOutputsMap(result: CallAgentOutput): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const counts = new Map<string, number>();
  for (const so of result.structuredOutputs ?? []) {
    const { nodeId, data } = so;
    const seen = counts.get(nodeId) ?? FIRST_SEEN;
    const key = buildOutputKey(nodeId, seen);
    map[key] = data;
    counts.set(nodeId, seen + INCREMENT);
  }
  return map;
}

export function buildAgentResponse(result: CallAgentOutput, durationMs: number): AgentAppResponse {
  return {
    appType: 'agent',
    text: result.text ?? '',
    toolCalls: buildToolCalls(result),
    tokenUsage: buildTokenUsage(result),
    durationMs,
  };
}

export function buildResponseByType(
  appType: string,
  result: CallAgentOutput,
  durationMs: number
): AgentExecutionResponse {
  if (appType === 'agent') return buildAgentResponse(result, durationMs);
  return buildWorkflowResponse(result, durationMs);
}

export function buildEmptyResponse(appType: string): AgentExecutionResponse {
  const tokenUsage = { inputTokens: ZERO, outputTokens: ZERO, cachedTokens: ZERO, totalCost: ZERO };
  if (appType === 'agent') {
    return { appType: 'agent', text: '', toolCalls: [], tokenUsage, durationMs: ZERO };
  }
  return {
    appType: 'workflow',
    text: '',
    currentNodeId: '',
    visitedNodes: [],
    toolCalls: [],
    structuredOutputs: {}, // empty response has no outputs
    tokenUsage,
    durationMs: ZERO,
  };
}

export function mergeStructuredOutputs(
  existing: Record<string, unknown[]>,
  result: CallAgentOutput
): Record<string, unknown[]> {
  const merged = { ...existing };
  for (const so of result.structuredOutputs ?? []) {
    const current = merged[so.nodeId] ?? [];
    merged[so.nodeId] = [...current, so.data];
  }
  return merged;
}
