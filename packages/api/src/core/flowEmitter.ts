import type { ParsedResult } from '@src/types/ai/index.js';
import type { Context, SimToolCall } from '@src/types/tools.js';
import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

import type { ProcessNodeResult, ToolCallsArray } from './nodeHelpers.js';
import { createEmptyTokenLog } from './tokenTracker.js';
import type { CallAgentInput } from './types.js';

const LAST_INDEX_OFFSET = 1;
const EMPTY_LENGTH = 0;

interface EmitNodeProcessedParams {
  context: Context;
  input: CallAgentInput;
  nodeId: string;
  parsedResult: ParsedResult;
  toolCalls: ToolCallsArray;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };
  reasoning?: string;
  toolResults?: Array<{ toolName: string; output: unknown }>;
  error?: string;
  responseMessages?: unknown[];
}

function resolveOutput(
  parsedResult: ParsedResult,
  structuredOutput?: { nodeId: string; data: unknown }
): unknown {
  if (structuredOutput !== undefined) return structuredOutput.data;
  if (parsedResult.nextNodeID === '') return { messageToUser: parsedResult.messageToUser };
  return parsedResult;
}

function mergeToolCallsWithResults(
  toolCalls: ToolCallsArray,
  toolResults?: Array<{ toolName: string; output: unknown }>
): SimToolCall[] {
  const resultsByName = new Map<string, unknown>();
  if (toolResults !== undefined) {
    for (const tr of toolResults) {
      resultsByName.set(tr.toolName, tr.output);
    }
  }
  return toolCalls.map((tc) => ({
    toolName: tc.toolName,
    input: tc.input as unknown,
    output: resultsByName.get(tc.toolName),
  }));
}

function emitNodeProcessed(params: EmitNodeProcessedParams): void {
  const { context, input, nodeId, parsedResult, toolCalls, durationMs, structuredOutput } = params;
  const { reasoning, toolResults, error, responseMessages } = params;
  if (context.onNodeProcessed === undefined) return;
  const lastLog = input.tokensLog.at(-LAST_INDEX_OFFSET);
  const tokens = lastLog?.tokens ?? createEmptyTokenLog();
  const mergedToolCalls = mergeToolCallsWithResults(toolCalls, toolResults);
  context.onNodeProcessed({
    nodeId,
    text: parsedResult.messageToUser,
    output: resolveOutput(parsedResult, structuredOutput),
    toolCalls: mergedToolCalls,
    reasoning,
    error,
    tokens,
    durationMs,
    structuredOutput,
    responseMessages,
  });
}

export type TimedResult = ProcessNodeResult & { durationMs: number };

interface EmitResultParams {
  context: Context;
  input: CallAgentInput;
  nodeId: string;
  result: TimedResult;
  errorOverride?: string;
}

export function emitResultForNode(params: EmitResultParams): void {
  const { context, input, nodeId, result, errorOverride } = params;
  emitNodeProcessed({
    context,
    input,
    nodeId,
    parsedResult: result.parsedResult,
    toolCalls: result.toolCalls,
    durationMs: result.durationMs,
    structuredOutput: result.structuredOutput,
    reasoning: result.reasoning,
    toolResults: result.toolResults,
    error: errorOverride,
    responseMessages: result.responseMessages,
  });
}

export function applySuccessResult(
  allToolCalls: ToolCallsArray,
  result: TimedResult,
  structuredOutputs: Record<string, unknown[]>,
  newStructuredOutputs: Array<{ nodeId: string; data: unknown }>
): void {
  const { toolCalls, structuredOutput } = result;
  if (toolCalls.length > EMPTY_LENGTH) allToolCalls.push(...toolCalls);
  if (structuredOutput === undefined) return;
  accumulateStructuredOutputEntry(structuredOutputs, newStructuredOutputs, structuredOutput);
}

export function accumulateStructuredOutputEntry(
  outputs: Record<string, unknown[]>,
  newOutputs: Array<{ nodeId: string; data: unknown }>,
  structuredOutput: { nodeId: string; data: unknown }
): void {
  const { nodeId, data } = structuredOutput;
  const existing = outputs[nodeId] ?? [];
  const hash = stableJsonStringify(data);
  const alreadyExists = existing.some((e) => stableJsonStringify(e) === hash);
  if (!alreadyExists) {
    Object.assign(outputs, { [nodeId]: [...existing, data] });
  }
  newOutputs.push(structuredOutput);
}
