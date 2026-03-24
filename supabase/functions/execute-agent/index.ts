// Supabase Edge Function — Stateless Agent Executor
// Receives complete payload, executes agent via @daviddh/llm-graph-runner, streams SSE events back.
// No DB access, no secrets resolution — all provided in the payload.

import { createMCPClient } from '@ai-sdk/mcp';
import type { McpServerConfig, McpTransport, RuntimeGraph } from '@daviddh/graph-types';
import type {
  CallAgentOutput,
  Context,
  Message,
  NodeProcessedEvent,
} from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';
import type { Tool } from 'ai';

interface ExecutePayload {
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

const SSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-master-key',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

/* ─── MCP session management ─── */

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

async function connectMcpServer(transport: McpTransport): Promise<McpClient> {
  if (transport.type === 'http') {
    return await createMCPClient({ transport: { type: 'http', url: transport.url, headers: transport.headers } });
  }
  if (transport.type === 'sse') {
    return await createMCPClient({ transport: { type: 'sse', url: transport.url, headers: transport.headers } });
  }
  throw new Error(`Unsupported transport type in edge function: ${transport.type}`);
}

interface McpConnectionResult {
  tools: Record<string, Tool>;
  clients: McpClient[];
}

interface McpConnectionFailure {
  server: string;
  error: string;
}

interface McpValidationResult {
  success: McpConnectionResult | null;
  failures: McpConnectionFailure[];
}

async function attemptMcpConnection(
  server: McpServerConfig
): Promise<{ client: McpClient; tools: Record<string, Tool> }> {
  const client = await connectMcpServer(server.transport);
  const tools = await client.tools();
  return { client, tools };
}

function buildMcpErrorMessage(failures: McpConnectionFailure[]): string {
  const details = failures.map((f) => `${f.server} (${f.error})`).join(', ');
  return `Failed to connect to MCP servers: ${details}`;
}

async function validateAndConnectMcpServers(servers: McpServerConfig[]): Promise<McpValidationResult> {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return { success: { tools: {}, clients: [] }, failures: [] };

  const results = await Promise.allSettled(enabled.map((server) => attemptMcpConnection(server)));

  const clients: McpClient[] = [];
  const allTools: Record<string, Tool> = {};
  const failures: McpConnectionFailure[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const server = enabled[i]!;
    if (result.status === 'fulfilled') {
      clients.push(result.value.client);
      Object.assign(allTools, result.value.tools);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      failures.push({ server: server.name, error: errMsg });
    }
  }

  if (failures.length > 0) {
    await closeMcpClients(clients);
    return { success: null, failures };
  }

  return { success: { tools: allTools, clients }, failures: [] };
}

async function closeMcpClients(clients: McpClient[]): Promise<void> {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
}

/* ─── Context builder ─── */

function buildContext(payload: ExecutePayload): Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'> {
  return {
    graph: payload.graph,
    apiKey: payload.apiKey,
    modelId: payload.modelId,
    sessionID: payload.sessionID,
    tenantID: payload.tenantID,
    userID: payload.userID,
    data: payload.data,
    quickReplies: payload.quickReplies,
    isFirstMessage: payload.isFirstMessage,
  };
}

/* ─── Token summation ─── */

function sumTokens(result: CallAgentOutput): { input: number; output: number; cached: number; cost: number } {
  let input = 0, output = 0, cached = 0, cost = 0;
  for (const log of result.tokensLogs) {
    input += log.tokens.input;
    output += log.tokens.output;
    cached += log.tokens.cached;
    cost += log.tokens.costUSD ?? 0;
  }
  return { input, output, cached, cost };
}

/* ─── Auth ─── */

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    mismatch |= bufA[i]! ^ bufB[i]!;
  }
  return mismatch === 0;
}

function authenticateRequest(req: Request): Response | null {
  const masterKey = Deno.env.get('EDGE_FUNCTION_MASTER_KEY');
  if (masterKey === undefined || masterKey === '') {
    return new Response('Server misconfigured', { status: 500 });
  }

  const token = req.headers.get('x-master-key') ?? '';

  if (token === '' || !timingSafeEqual(token, masterKey)) {
    return new Response('Unauthorized', { status: 401 });
  }

  return null;
}

/* ─── Main handler ─── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: SSE_HEADERS });
  }

  const authError = authenticateRequest(req);
  if (authError !== null) return authError;

  const payload: ExecutePayload = await req.json();
  const mcpServers = payload.graph.mcpServers ?? [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (event: Record<string, unknown>): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let clients: McpClient[] = [];

      try {
        const validation = await validateAndConnectMcpServers(mcpServers);

        if (validation.success === null) {
          write({ type: 'error', message: buildMcpErrorMessage(validation.failures) });
          return;
        }

        clients = validation.success.clients;

        const context = buildContext(payload);
        const result = await executeWithCallbacks({
          context,
          messages: payload.messages,
          currentNode: payload.currentNodeId,
          toolsOverride: validation.success.tools,
          structuredOutputs: payload.structuredOutputs,
          onNodeVisited: (nodeId: string) => {
            write({ type: 'node_visited', nodeId });
          },
          onNodeProcessed: (event: NodeProcessedEvent) => {
            write({
              type: 'node_processed',
              nodeId: event.nodeId,
              text: event.text ?? '',
              output: event.output,
              toolCalls: event.toolCalls.map((tc) => ({
                toolName: tc.toolName,
                input: tc.input,
                output: tc.output,
              })),
              reasoning: event.reasoning,
              error: event.error,
              tokens: event.tokens,
              durationMs: event.durationMs,
              structuredOutput: event.structuredOutput,
            });
          },
        });

        if (result !== null) {
          const tokens = sumTokens(result);
          write({
            type: 'agent_response',
            text: result.text ?? '',
            visitedNodes: result.visitedNodes,
            toolCalls: result.toolCalls.map((tc) => ({
              toolName: tc.toolName,
              input: tc.input,
              output: undefined,
            })),
            nodeTokens: result.tokensLogs.map((l) => ({ node: l.action, tokens: l.tokens })),
            tokenUsage: tokens,
            debugMessages: result.debugMessages,
            structuredOutputs: result.structuredOutputs,
            parsedResults: result.parsedResults,
          });
        }

        write({ type: 'execution_complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Execution failed';
        write({ type: 'error', message });
      } finally {
        await closeMcpClients(clients);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
