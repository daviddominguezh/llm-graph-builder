import type { McpTransport } from '@/app/schemas/graph.schema';
import { z } from 'zod';

import type { SimCompositionCallbacks } from './sseSimComposition';
import { SimCompositionSchemaFields, dispatchSimCompositionEvent } from './sseSimComposition';

const SSE_DATA_PREFIX = 'data: ';
const EMPTY_LENGTH = 0;

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const DiscoverResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
});

async function fetchJsonUnknown(res: Response): Promise<unknown> {
  const text = await res.text();
  return JSON.parse(text) as unknown;
}

async function parseDiscoverError(res: Response): Promise<string> {
  const raw = await fetchJsonUnknown(res);
  const parsed = ErrorResponseSchema.safeParse(raw);
  return parsed.success ? (parsed.data.error ?? 'Discovery failed') : 'Discovery failed';
}

export interface DiscoverOptions {
  variableValues?: Record<string, unknown>;
  orgId?: string;
  libraryItemId?: string;
}

export async function discoverMcpTools(
  transport: McpTransport,
  options?: DiscoverOptions
): Promise<DiscoveredTool[]> {
  const res = await fetch('/api/mcp/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transport,
      variableValues: options?.variableValues,
      orgId: options?.orgId,
      libraryItemId: options?.libraryItemId,
    }),
  });
  if (!res.ok) {
    const message = await parseDiscoverError(res);
    throw new Error(message);
  }
  const raw = await fetchJsonUnknown(res);
  const data = DiscoverResponseSchema.parse(raw);
  return data.tools;
}

export interface ToolCallOptions {
  variableValues?: Record<string, unknown>;
  orgId?: string;
  libraryItemId?: string;
}

export interface ToolCallResult {
  success: true;
  result: unknown;
}

export interface ToolCallError {
  success: false;
  error: { message: string; code?: string; details?: unknown };
}

export type ToolCallResponse = ToolCallResult | ToolCallError;

const ToolCallResponseSchema = z.union([
  z.object({ success: z.literal(true), result: z.unknown() }),
  z.object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string().optional(),
      details: z.unknown().optional(),
    }),
  }),
]);

export async function callMcpTool(
  transport: McpTransport,
  toolName: string,
  args: Record<string, unknown>,
  options?: ToolCallOptions,
  signal?: AbortSignal
): Promise<ToolCallResponse> {
  const res = await fetch('/api/mcp/tools/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transport,
      toolName,
      args,
      variableValues: options?.variableValues,
      orgId: options?.orgId,
      libraryItemId: options?.libraryItemId,
    }),
    signal,
  });
  const raw = await fetchJsonUnknown(res);
  return ToolCallResponseSchema.parse(raw) as ToolCallResponse;
}

export interface SimulateRequestBody {
  graph: Record<string, unknown>;
  messages: unknown[];
  currentNode: string;
  apiKeyId: string;
  modelId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  structuredOutputs?: Record<string, unknown[]>;
  orgId?: string;
}

interface SseToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
}

interface SseNodeTokens {
  node: string;
  tokens: { input: number; output: number; cached: number; costUSD?: number };
}

interface AgentResponseEvent {
  type: 'agent_response';
  text: string;
  visitedNodes: string[];
  toolCalls: SseToolCall[];
  nodeTokens: SseNodeTokens[];
  tokenUsage: { input: number; output: number; cached: number };
}

export interface NodeProcessedEvent {
  nodeId: string;
  text: string;
  output?: unknown;
  toolCalls: SseToolCall[];
  reasoning?: string;
  error?: string;
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs?: number;
  structuredOutput?: { nodeId: string; data: unknown };
}

export interface StreamCallbacks extends SimCompositionCallbacks {
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
  onAgentResponse?: (event: AgentResponseEvent) => void;
  onChildDispatched?: (event: { childExecutionId: string; childAppType: string }) => void;
  onChildCompleted?: (event: { parentExecutionId: string; output: string; status: string }) => void;
  onError?: (message: string) => void;
  onComplete?: () => void;
}

const SseToolCallSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown(),
});

const SseNodeTokensSchema = z.object({
  node: z.string(),
  tokens: z.object({ input: z.number(), output: z.number(), cached: z.number() }),
});

const TokensSchema = z.object({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
  costUSD: z.number().optional(),
});

const StructuredOutputSchema = z.object({
  nodeId: z.string(),
  data: z.unknown(),
});

const SseEventSchema = z.object({
  type: z.string(),
  nodeId: z.string().optional(),
  text: z.string().optional(),
  output: z.unknown().optional(),
  visitedNodes: z.array(z.string()).optional(),
  toolCalls: z.array(SseToolCallSchema).optional(),
  nodeTokens: z.array(SseNodeTokensSchema).optional(),
  tokens: TokensSchema.optional(),
  tokenUsage: TokensSchema.optional(),
  durationMs: z.number().optional(),
  message: z.string().optional(),
  structuredOutput: StructuredOutputSchema.optional(),
  reasoning: z.string().optional(),
  error: z.string().optional(),
  // Agent-specific fields
  step: z.number().optional(),
  responseText: z.string().optional(),
  totalSteps: z.number().optional(),
  // Child workflow fields
  childExecutionId: z.string().optional(),
  childAppType: z.string().optional(),
  parentExecutionId: z.string().optional(),
  status: z.string().optional(),
  // Simulation composition fields
  ...SimCompositionSchemaFields,
});

type SseEvent = z.infer<typeof SseEventSchema>;

function handleNodeVisited(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.nodeId !== undefined) {
    callbacks.onNodeVisited?.(event.nodeId);
  }
}

function handleNodeProcessed(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.nodeId !== undefined && event.tokens !== undefined) {
    callbacks.onNodeProcessed?.({
      nodeId: event.nodeId,
      text: event.text ?? '',
      output: event.output,
      toolCalls: event.toolCalls ?? [],
      reasoning: event.reasoning,
      error: event.error,
      tokens: event.tokens,
      durationMs: event.durationMs,
      structuredOutput: event.structuredOutput,
    });
  }
}

function handleAgentResponse(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.text !== undefined && event.visitedNodes !== undefined && event.tokenUsage !== undefined) {
    callbacks.onAgentResponse?.({
      type: 'agent_response',
      text: event.text,
      visitedNodes: event.visitedNodes,
      toolCalls: event.toolCalls ?? [],
      nodeTokens: event.nodeTokens ?? [],
      tokenUsage: event.tokenUsage,
    });
  }
}

function handleStepStarted(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.step !== undefined) {
    callbacks.onNodeVisited?.(`step-${String(event.step)}`);
  }
}

function handleStepProcessed(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.step !== undefined) {
    callbacks.onNodeProcessed?.({
      nodeId: `step-${String(event.step)}`,
      text: event.responseText ?? '',
      output: undefined,
      toolCalls: event.toolCalls ?? [],
      tokens: event.tokens ?? { input: 0, output: 0, cached: 0 },
      durationMs: event.durationMs,
    });
  }
}

function handleChildDispatched(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.childExecutionId !== undefined && event.childAppType !== undefined) {
    callbacks.onChildDispatched?.({
      childExecutionId: event.childExecutionId,
      childAppType: event.childAppType,
    });
  }
}

function handleChildCompleted(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.parentExecutionId !== undefined && event.text !== undefined && event.status !== undefined) {
    callbacks.onChildCompleted?.({
      parentExecutionId: event.parentExecutionId,
      output: event.text,
      status: event.status,
    });
  }
}

function dispatchSseEvent(event: SseEvent, callbacks: StreamCallbacks): void {
  if (dispatchSimCompositionEvent(event, callbacks)) return;
  if (event.type === 'node_visited') {
    handleNodeVisited(event, callbacks);
  } else if (event.type === 'node_processed') {
    handleNodeProcessed(event, callbacks);
  } else if (event.type === 'step_started') {
    handleStepStarted(event, callbacks);
  } else if (event.type === 'step_processed') {
    handleStepProcessed(event, callbacks);
  } else if (event.type === 'agent_response') {
    handleAgentResponse(event, callbacks);
  } else if (event.type === 'child_dispatched') {
    handleChildDispatched(event, callbacks);
  } else if (event.type === 'child_completed') {
    handleChildCompleted(event, callbacks);
  } else if (event.type === 'error' && event.message !== undefined) {
    callbacks.onError?.(event.message);
  } else if (event.type === 'simulation_complete') {
    callbacks.onComplete?.();
  }
}

function parseSseLine(line: string, callbacks: StreamCallbacks): void {
  if (!line.startsWith(SSE_DATA_PREFIX)) return;
  const raw: unknown = JSON.parse(line.slice(SSE_DATA_PREFIX.length));
  const result = SseEventSchema.safeParse(raw);
  if (result.success) {
    console.log('[sse:parse] event type:', result.data.type, 'depth:', result.data.depth);
    dispatchSseEvent(result.data, callbacks);
  } else {
    console.warn(
      '[sse:parse] failed to parse event:',
      result.error.message,
      'raw:',
      JSON.stringify(raw).slice(0, 200)
    );
  }
}

function processBufferedLines(lines: string[], callbacks: StreamCallbacks): void {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > EMPTY_LENGTH) {
      parseSseLine(trimmed, callbacks);
    }
  }
}

function processChunk(decoder: TextDecoder, value: Uint8Array | undefined, buffer: string): string {
  if (value === undefined) return buffer;
  return buffer + decoder.decode(value, { stream: true });
}

interface StreamReaderState {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  callbacks: StreamCallbacks;
  buffer: string;
}

function processStreamChunk(state: StreamReaderState, chunk: ReadableStreamReadResult<Uint8Array>): string {
  const updated = processChunk(state.decoder, chunk.value, state.buffer);
  const lines = updated.split('\n');
  const remaining = lines.pop() ?? '';
  processBufferedLines(lines, state.callbacks);
  return remaining;
}

async function readNextChunk(state: StreamReaderState): Promise<void> {
  const chunk = await state.reader.read();
  if (chunk.done) return;
  const remaining = processStreamChunk(state, chunk);
  await readNextChunk({ ...state, buffer: remaining });
}

export async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks
): Promise<void> {
  await readNextChunk({ reader, decoder: new TextDecoder(), callbacks, buffer: '' });
}

export async function streamSimulation(
  params: SimulateRequestBody,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Simulation request failed: ${String(res.status)}`);
  }

  const reader = res.body?.getReader();
  if (reader === undefined) {
    throw new Error('No response stream available');
  }

  await readSseStream(reader, callbacks);
}
