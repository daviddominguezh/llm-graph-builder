import type { CallAgentOutput, Message, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import type { RuntimeGraph } from '@daviddh/graph-types';

export interface ExecuteAgentParams {
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
}

export interface ExecuteAgentCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}

/* ─── Environment ─── */

function getRequiredEnv(name: string): string {
  const val = process.env[name];
  if (val === undefined || val === '') throw new Error(`Missing env var: ${name}`);
  return val;
}

/* ─── SSE line parser ─── */

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

function parseSseLine(line: string): SseEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const json = trimmed.slice('data:'.length).trim();
  if (json === '') return null;
  return JSON.parse(json) as SseEvent;
}

/* ─── Stream reader ─── */

async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.value !== undefined) {
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseSseLine(line);
        if (event !== null) yield event;
      }
    }
    if (buffer.trim() !== '') {
      const event = parseSseLine(buffer);
      if (event !== null) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/* ─── Event processing ─── */

function processNodeProcessed(event: SseEvent, callbacks: ExecuteAgentCallbacks): void {
  callbacks.onNodeProcessed({
    nodeId: String(event.nodeId ?? ''),
    text: event.text as string | undefined,
    output: event.output,
    toolCalls: (event.toolCalls as NodeProcessedEvent['toolCalls']) ?? [],
    reasoning: event.reasoning as string | undefined,
    error: event.error as string | undefined,
    tokens: (event.tokens as NodeProcessedEvent['tokens']) ?? { input: 0, output: 0, cached: 0 },
    durationMs: (event.durationMs as number) ?? 0,
    structuredOutput: event.structuredOutput as NodeProcessedEvent['structuredOutput'],
  });
}

function buildResultFromResponse(event: SseEvent): CallAgentOutput {
  return {
    message: null,
    text: String(event.text ?? ''),
    visitedNodes: (event.visitedNodes as string[]) ?? [],
    toolCalls: (event.toolCalls as CallAgentOutput['toolCalls']) ?? [],
    tokensLogs: (event.nodeTokens as CallAgentOutput['tokensLogs']) ?? [],
    debugMessages: (event.debugMessages as CallAgentOutput['debugMessages']) ?? {},
    structuredOutputs: (event.structuredOutputs as CallAgentOutput['structuredOutputs']) ?? [],
  };
}

/* ─── Main: call edge function ─── */

export async function executeAgent(
  params: ExecuteAgentParams,
  callbacks: ExecuteAgentCallbacks
): Promise<CallAgentOutput | null> {
  const edgeFunctionUrl = getRequiredEnv('SUPABASE_EDGE_FUNCTION_URL');
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  const response = await fetch(`${edgeFunctionUrl}/execute-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
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

  let result: CallAgentOutput | null = null;

  for await (const event of readSseStream(response.body)) {
    if (event.type === 'node_visited') {
      callbacks.onNodeVisited(String(event.nodeId));
    } else if (event.type === 'node_processed') {
      processNodeProcessed(event, callbacks);
    } else if (event.type === 'agent_response') {
      result = buildResultFromResponse(event);
    } else if (event.type === 'error') {
      throw new Error(String(event.message ?? 'Edge function execution error'));
    }
  }

  return result;
}
