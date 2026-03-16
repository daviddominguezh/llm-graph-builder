import type { McpTransport } from '@/app/schemas/graph.schema';
import { z } from 'zod';

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

export interface SimulateRequestBody {
  graph: Record<string, unknown>;
  messages: unknown[];
  currentNode: string;
  apiKeyId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  structuredOutputs?: Record<string, unknown[]>;
}

interface SseToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
}

interface SseNodeTokens {
  node: string;
  tokens: { input: number; output: number; cached: number };
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
  toolCalls: SseToolCall[];
  tokens: { input: number; output: number; cached: number };
  durationMs?: number;
  structuredOutput?: { nodeId: string; data: unknown };
}

export interface StreamCallbacks {
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
  onAgentResponse?: (event: AgentResponseEvent) => void;
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

const TokensSchema = z.object({ input: z.number(), output: z.number(), cached: z.number() });

const StructuredOutputSchema = z.object({
  nodeId: z.string(),
  data: z.unknown(),
});

const SseEventSchema = z.object({
  type: z.string(),
  nodeId: z.string().optional(),
  text: z.string().optional(),
  visitedNodes: z.array(z.string()).optional(),
  toolCalls: z.array(SseToolCallSchema).optional(),
  nodeTokens: z.array(SseNodeTokensSchema).optional(),
  tokens: TokensSchema.optional(),
  tokenUsage: TokensSchema.optional(),
  durationMs: z.number().optional(),
  message: z.string().optional(),
  structuredOutput: StructuredOutputSchema.optional(),
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
      toolCalls: event.toolCalls ?? [],
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

function dispatchSseEvent(event: SseEvent, callbacks: StreamCallbacks): void {
  if (event.type === 'node_visited') {
    handleNodeVisited(event, callbacks);
  } else if (event.type === 'node_processed') {
    handleNodeProcessed(event, callbacks);
  } else if (event.type === 'agent_response') {
    handleAgentResponse(event, callbacks);
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
    dispatchSseEvent(result.data, callbacks);
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

async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks
): Promise<void> {
  await readNextChunk({ reader, decoder: new TextDecoder(), callbacks, buffer: '' });
}

export async function streamSimulation(
  params: SimulateRequestBody,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
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
