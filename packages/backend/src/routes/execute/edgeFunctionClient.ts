import type { RuntimeGraph } from '@daviddh/graph-types';
import type { CallAgentOutput, Message, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import { handleStepProcessed } from './edgeFunctionAgentEvents.js';
import { buildResultFromResponse, mapRawToolCalls } from './edgeFunctionOutputParsers.js';
import type { NodeProcessedData, VfsEdgeFunctionPayload } from './executeSharedTypes.js';
import {
  type SseEvent,
  extractLineEvents,
  isRecord,
  parseTrailingBuffer,
  toNum,
  toOptStr,
  toRecord,
  toStr,
} from './sseHelpers.js';

export type { NodeProcessedData, VfsEdgeFunctionPayload } from './executeSharedTypes.js';

export interface GoogleCalendarEdgePayload {
  accessToken: string;
  orgId: string;
}

export interface ExecuteAgentParams {
  appType?: 'workflow' | 'agent';
  graph: RuntimeGraph;
  apiKey: string;
  modelId: string;
  currentNodeId: string;
  messages: Message[];
  structuredOutputs: Record<string, unknown[]>;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  sessionID: string;
  tenantID: string;
  userID: string;
  isFirstMessage: boolean;
  vfs?: VfsEdgeFunctionPayload;
  // Agent-specific fields (used when appType === 'agent')
  systemPrompt?: string;
  context?: string;
  maxSteps?: number | null;
  isChildAgent?: boolean;
  conversationId?: string;
  // Pre-resolved OAuth bundles for stateless edge function execution
  googleCalendar?: GoogleCalendarEdgePayload;
}

export interface ExecuteAgentCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}

/* ─── Environment ─── */

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function getRequiredEnv(name: string): string {
  const val = readEnv(name);
  if (val === undefined || val === '') throw new Error(`Missing env var: ${name}`);
  return val;
}

/* ─── Stream reader (recursive to avoid await-in-loop) ─── */

type DecodeChunk = (value: Uint8Array) => string;

async function* readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decode: DecodeChunk,
  buffer: string
): AsyncGenerator<SseEvent> {
  const { done, value } = await reader.read();
  const text = value === undefined ? '' : decode(value);
  const updated = buffer + text;

  if (done) {
    yield* parseTrailingBuffer(updated);
    return;
  }

  const { events, remaining } = extractLineEvents(updated);
  yield* events;
  yield* readChunks(reader, decode, remaining);
}

async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const decode: DecodeChunk = (v) => decoder.decode(v, { stream: true });
  try {
    yield* readChunks(reader, decode, '');
  } finally {
    reader.releaseLock();
  }
}

/* ─── Type-safe SSE event parsers ─── */

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

function parseStructuredOutput(value: unknown): NodeProcessedEvent['structuredOutput'] {
  if (!isRecord(value)) return undefined;
  return { nodeId: toStr(value.nodeId), data: value.data };
}

/* ─── Event processing ─── */

function processNodeProcessed(event: SseEvent, callbacks: ExecuteAgentCallbacks): void {
  callbacks.onNodeProcessed({
    nodeId: toStr(event.nodeId),
    text: toOptStr(event.text),
    output: event.output,
    toolCalls: parseSimToolCalls(event.toolCalls),
    reasoning: toOptStr(event.reasoning),
    error: toOptStr(event.error),
    tokens: parseTokenLog(event.tokens),
    durationMs: toNum(event.durationMs),
    structuredOutput: parseStructuredOutput(event.structuredOutput),
  });
}

/* ─── SSE event handlers ─── */

function handleNodeProcessed(
  event: SseEvent,
  nodeTexts: NodeProcessedData[],
  callbacks: ExecuteAgentCallbacks
): void {
  nodeTexts.push({
    nodeId: toStr(event.nodeId),
    text: toStr(event.text),
    toolCalls: mapRawToolCalls(event.toolCalls),
    durationMs: toNum(event.durationMs),
    error: toOptStr(event.error),
    responseMessages: Array.isArray(event.responseMessages)
      ? (event.responseMessages as unknown[])
      : undefined,
  });
  processNodeProcessed(event, callbacks);
}

interface SseEventResult {
  agentOutput: CallAgentOutput | undefined;
}

function handleSseEvent(
  event: SseEvent,
  nodeTexts: NodeProcessedData[],
  callbacks: ExecuteAgentCallbacks
): SseEventResult {
  if (event.type === 'node_visited') {
    callbacks.onNodeVisited(toStr(event.nodeId));
  } else if (event.type === 'step_started') {
    callbacks.onNodeVisited(`step-${String(toNum(event.step))}`);
  } else if (event.type === 'node_processed') {
    handleNodeProcessed(event, nodeTexts, callbacks);
  } else if (event.type === 'step_processed') {
    handleStepProcessed(event, nodeTexts, callbacks);
  } else if (event.type === 'agent_response') {
    return { agentOutput: buildResultFromResponse(event, nodeTexts) };
  } else if (event.type === 'error') {
    const msg = toStr(event.message);
    throw new Error(msg === '' ? 'Edge function execution error' : msg);
  }
  return { agentOutput: undefined };
}

/* ─── Main: call edge function ─── */

export interface ExecuteAgentResult {
  output: CallAgentOutput | null;
  nodeData: NodeProcessedData[];
}

export async function executeAgent(
  params: ExecuteAgentParams,
  callbacks: ExecuteAgentCallbacks
): Promise<ExecuteAgentResult> {
  const edgeFunctionUrl = getRequiredEnv('SUPABASE_EDGE_FUNCTION_URL');
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const masterKey = getRequiredEnv('EDGE_FUNCTION_MASTER_KEY');

  const response = await fetch(`${edgeFunctionUrl}/execute-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'x-master-key': masterKey,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function error (${String(response.status)}): ${text}`);
  }

  if (response.body === null) {
    throw new Error('Edge function returned no body');
  }

  return await processEventStream(response.body, callbacks);
}

async function processEventStream(
  body: ReadableStream<Uint8Array>,
  callbacks: ExecuteAgentCallbacks
): Promise<ExecuteAgentResult> {
  let result: CallAgentOutput | null = null;
  const nodeTexts: NodeProcessedData[] = [];

  for await (const event of readSseStream(body)) {
    const { agentOutput } = handleSseEvent(event, nodeTexts, callbacks);
    if (agentOutput !== undefined) {
      result = agentOutput;
    }
  }

  return { output: result, nodeData: nodeTexts };
}
