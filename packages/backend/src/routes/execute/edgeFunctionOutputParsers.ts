import { isDispatchSentinel, isFinishSentinel } from '@daviddh/llm-graph-runner';
import type { CallAgentOutput } from '@daviddh/llm-graph-runner';

import { buildAgentLoopResult } from './edgeFunctionAgentEvents.js';
import type { NodeProcessedData, ToolCallData } from './executeSharedTypes.js';
import { type SseEvent, toNum, toOptStr, toRecord, toStr, toStringArray } from './sseHelpers.js';

export function mapRawToolCalls(raw: unknown): ToolCallData[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    const rec = toRecord(item);
    const toolName = toStr(rec.toolName);
    return {
      name: toolName === '' ? toStr(rec.name) : toolName,
      args: rec.input ?? rec.args,
      result: rec.output ?? rec.result,
    };
  });
}

function mapNodeTokensToTokensLogs(nodeTokens: unknown): CallAgentOutput['tokensLogs'] {
  if (!Array.isArray(nodeTokens)) return [];
  return nodeTokens.map((item: unknown) => {
    const rec = toRecord(item);
    const tokens = toRecord(rec.tokens);
    return {
      action: toStr(rec.node),
      tokens: {
        input: toNum(tokens.input),
        output: toNum(tokens.output),
        cached: toNum(tokens.cached),
        costUSD: typeof tokens.costUSD === 'number' ? tokens.costUSD : undefined,
      },
    };
  });
}

function isDebugMessages(value: unknown): value is CallAgentOutput['debugMessages'] {
  return typeof value === 'object' && value !== null;
}

function isToolCallsArray(value: unknown): value is CallAgentOutput['toolCalls'] {
  return Array.isArray(value);
}

function parseStructuredOutputs(value: unknown): Array<{ nodeId: string; data: unknown }> {
  if (!Array.isArray(value)) return [];
  return value.map((item: unknown) => {
    const rec = toRecord(item);
    return { nodeId: toStr(rec.nodeId), data: rec.data };
  });
}

function buildParsedResults(
  event: SseEvent,
  nodeTexts: NodeProcessedData[]
): CallAgentOutput['parsedResults'] {
  if (Array.isArray(event.parsedResults)) {
    return event.parsedResults.map((item: unknown) => {
      const rec = toRecord(item);
      return { nextNodeID: toStr(rec.nextNodeID), messageToUser: toOptStr(rec.messageToUser) };
    });
  }
  return nodeTexts.map((nt) => ({
    nextNodeID: '',
    messageToUser: nt.text === '' ? undefined : nt.text,
  }));
}

export function buildResultFromResponse(event: SseEvent, nodeTexts: NodeProcessedData[]): CallAgentOutput {
  if (event.steps !== undefined) {
    return buildAgentLoopResult(event, nodeTexts);
  }
  return {
    message: null,
    text: toStr(event.text),
    visitedNodes: toStringArray(event.visitedNodes),
    toolCalls: isToolCallsArray(event.toolCalls) ? event.toolCalls : [],
    tokensLogs: mapNodeTokensToTokensLogs(event.nodeTokens),
    debugMessages: isDebugMessages(event.debugMessages) ? event.debugMessages : {},
    structuredOutputs: parseStructuredOutputs(event.structuredOutputs),
    parsedResults: buildParsedResults(event, nodeTexts),
    dispatchResult: isDispatchSentinel(event.dispatchResult) ? event.dispatchResult : undefined,
    finishResult: isFinishSentinel(event.finishResult) ? event.finishResult : undefined,
  };
}
