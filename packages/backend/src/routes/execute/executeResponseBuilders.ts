import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import { sumTokens, sumTotalCost } from './executeHelpers.js';
import type { AgentExecutionResponse } from './executeTypes.js';

const LAST_INDEX_OFFSET = 1;
const ZERO = 0;

export function getLastVisitedNode(result: CallAgentOutput, fallback: string): string {
  const { visitedNodes } = result;
  return visitedNodes[visitedNodes.length - LAST_INDEX_OFFSET] ?? fallback;
}

function buildToolCalls(result: CallAgentOutput): AgentExecutionResponse['toolCalls'] {
  return result.toolCalls.map((tc) => ({
    name: tc.toolName,
    args: tc.input as unknown,
    result: undefined,
  }));
}

export function buildAgentResponse(result: CallAgentOutput, durationMs: number): AgentExecutionResponse {
  const tokens = sumTokens(result);
  return {
    text: result.text ?? '',
    currentNodeId: getLastVisitedNode(result, ''),
    visitedNodes: result.visitedNodes,
    toolCalls: buildToolCalls(result),
    structuredOutputs: {},
    tokenUsage: {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cachedTokens: tokens.cached,
      totalCost: sumTotalCost(result),
    },
    durationMs,
  };
}

export function buildEmptyResponse(): AgentExecutionResponse {
  return {
    text: '',
    currentNodeId: '',
    visitedNodes: [],
    toolCalls: [],
    structuredOutputs: {},
    tokenUsage: { inputTokens: ZERO, outputTokens: ZERO, cachedTokens: ZERO, totalCost: ZERO },
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
