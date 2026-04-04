import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import type { NodeProcessedData, ToolCallData } from './executeSharedTypes.js';
import { type SseEvent, toNum, toOptStr, toRecord, toStr } from './sseHelpers.js';

/* ─── Shared parsers ─── */

function parseSimToolCalls(value: unknown): NodeProcessedEvent['toolCalls'] {
  if (!Array.isArray(value)) return [];
  return value.map((item: unknown) => {
    const rec = toRecord(item);
    return { toolName: toStr(rec.toolName), input: rec.input, output: rec.output };
  });
}

function parseTokenLog(value: unknown): NodeProcessedEvent['tokens'] {
  const rec = toRecord(value);
  return { input: toNum(rec.input), output: toNum(rec.output), cached: toNum(rec.cached) };
}

function mapRawToolCalls(raw: unknown): ToolCallData[] {
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

function isToolCallsArray(value: unknown): value is CallAgentOutput['toolCalls'] {
  return Array.isArray(value);
}

function mapNodeTokensToTokensLogs(nodeTokens: unknown): CallAgentOutput['tokensLogs'] {
  if (!Array.isArray(nodeTokens)) return [];
  return nodeTokens.map((item: unknown) => {
    const rec = toRecord(item);
    const tokens = toRecord(rec.tokens);
    return {
      action: toStr(rec.node ?? rec.action),
      tokens: {
        input: toNum(tokens.input),
        output: toNum(tokens.output),
        cached: toNum(tokens.cached),
        costUSD: typeof tokens.costUSD === 'number' ? tokens.costUSD : undefined,
      },
    };
  });
}

/* ─── Step event processing (agent path) ─── */

export interface AgentEventCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}

export function handleStepProcessed(
  event: SseEvent,
  nodeTexts: NodeProcessedData[],
  callbacks: AgentEventCallbacks
): void {
  const stepId = `step-${toStr(event.step)}`;
  nodeTexts.push({
    nodeId: stepId,
    text: toStr(event.responseText),
    toolCalls: mapRawToolCalls(event.toolCalls),
    durationMs: toNum(event.durationMs),
    error: toOptStr(event.error),
    responseMessages: Array.isArray(event.responseMessages)
      ? (event.responseMessages as unknown[])
      : undefined,
  });
  callbacks.onNodeProcessed({
    nodeId: stepId,
    text: toOptStr(event.responseText),
    output: undefined,
    toolCalls: parseSimToolCalls(event.toolCalls),
    reasoning: toOptStr(event.reasoning),
    error: toOptStr(event.error),
    tokens: parseTokenLog(event.tokens),
    durationMs: toNum(event.durationMs),
    structuredOutput: undefined,
  });
}

/* ─── Agent loop result builder ─── */

function buildTokensLogsFromEvent(event: SseEvent): CallAgentOutput['tokensLogs'] {
  const mapped = Array.isArray(event.tokensLogs) ? mapNodeTokensToTokensLogs(event.tokensLogs) : [];
  const EMPTY = 0;
  if (mapped.length > EMPTY) return mapped;
  // Fallback: build from totalTokens if tokensLogs is empty
  const total = toRecord(event.totalTokens);
  return [{
    action: 'total',
    tokens: {
      input: toNum(total.input),
      output: toNum(total.output),
      cached: toNum(total.cached),
      costUSD: typeof total.costUSD === 'number' ? total.costUSD : undefined,
    },
  }];
}

export function buildAgentLoopResult(event: SseEvent, nodeTexts: NodeProcessedData[]): CallAgentOutput {
  const tokensLogs = buildTokensLogsFromEvent(event);
  return {
    message: null,
    text: toStr(event.text),
    visitedNodes: nodeTexts.map((nt) => nt.nodeId),
    toolCalls: isToolCallsArray(event.toolCalls) ? event.toolCalls : [],
    tokensLogs,
    debugMessages: {},
    structuredOutputs: [],
    parsedResults: nodeTexts.map((nt) => ({
      nextNodeID: '',
      messageToUser: nt.text === '' ? undefined : nt.text,
    })),
  };
}
