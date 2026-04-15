// Supabase Edge Function — Stateless Agent Executor
// Receives complete payload, executes agent via @daviddh/llm-graph-runner, streams SSE events back.
// No DB access, no secrets resolution — all provided in the payload.
import { createMCPClient } from '@ai-sdk/mcp';
import type { McpServerConfig, McpTransport, RuntimeGraph } from '@daviddh/graph-types';
import type {
  AgentLoopResult,
  AgentStepEvent,
  CallAgentOutput,
  Context,
  Logger,
  Message,
  NodeProcessedEvent,
} from '@daviddh/llm-graph-runner';
import { VFSContext, executeAgentLoop, executeWithCallbacks, generateVFSTools, injectSystemTools } from '@daviddh/llm-graph-runner';
import { GitHubSourceProvider } from '@daviddh/vfs-providers';
import type { Tool } from 'ai';

interface VfsPayloadData {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  tenantSlug: string;
  agentSlug: string;
  userJwt: string;
  settings: {
    protectedPaths?: string[];
    searchCandidateLimit?: number;
    readLineCeiling?: number;
    rateLimitThreshold?: number;
  };
}

interface ExecutePayload {
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
  vfs?: VfsPayloadData;
  // Agent-specific fields
  systemPrompt?: string;
  context?: string;
  maxSteps?: number | null;
  isChildAgent?: boolean;
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
    return await createMCPClient({
      transport: { type: 'http', url: transport.url, headers: transport.headers },
    });
  }
  if (transport.type === 'sse') {
    return await createMCPClient({
      transport: { type: 'sse', url: transport.url, headers: transport.headers },
    });
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
  await client.listTools();
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

function buildContext(
  payload: ExecutePayload
): Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'> {
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

/* ─── VFS bootstrap ─── */

interface VfsBootstrapResult {
  tools: Record<string, Tool>;
}

function buildSourceProvider(vfs: VfsPayloadData): InstanceType<typeof GitHubSourceProvider> {
  return new GitHubSourceProvider({
    token: vfs.token,
    owner: vfs.owner,
    repo: vfs.repo,
    commitSha: vfs.commitSha,
  });
}

function buildVfsContextConfig(
  vfs: VfsPayloadData,
  payload: ExecutePayload,
  sourceProvider: InstanceType<typeof GitHubSourceProvider>,
  supabaseClient: unknown,
  redisClient: unknown
) {
  return {
    tenantSlug: vfs.tenantSlug,
    agentSlug: vfs.agentSlug,
    userID: payload.userID,
    sessionId: payload.sessionID,
    commitSha: vfs.commitSha,
    sourceProvider,
    supabase: supabaseClient,
    redis: redisClient,
    protectedPaths: vfs.settings.protectedPaths,
    searchCandidateLimit: vfs.settings.searchCandidateLimit,
    readLineCeiling: vfs.settings.readLineCeiling,
    rateLimitThreshold: vfs.settings.rateLimitThreshold,
  };
}

async function bootstrapVfs(
  payload: ExecutePayload,
  context: Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'>
): Promise<VfsBootstrapResult | null> {
  if (payload.vfs === undefined) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const { Redis } = await import('@upstash/redis');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL') ?? '';
  const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? '';

  const supabaseForVfs = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${payload.vfs.userJwt}` } },
  });
  const redis = new Redis({ url: redisUrl, token: redisToken });

  const sourceProvider = buildSourceProvider(payload.vfs);
  const config = buildVfsContextConfig(payload.vfs, payload, sourceProvider, supabaseForVfs, redis);
  const vfsContext = new VFSContext(config);
  await vfsContext.initialize();

  const tools = generateVFSTools(context, vfsContext);
  return { tools };
}

/* ─── Token summation ─── */

function sumTokens(result: CallAgentOutput): { input: number; output: number; cached: number; cost: number } {
  let input = 0,
    output = 0,
    cached = 0,
    cost = 0;
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

/* ─── Logging ─── */

const log = {
  info: (msg: string) => console.info(`[edge] ${msg}`),
  error: (msg: string) => console.error(`[edge] ${msg}`),
  debug: (msg: string) => console.debug(`[edge] ${msg}`),
  warn: (msg: string) => console.warn(`[edge] ${msg}`),
};

function prefixed(fn: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => fn('[runner]', ...args);
}

const runnerLogger: Logger = {
  error: prefixed(console.error),
  warn: prefixed(console.warn),
  help: prefixed(console.info),
  data: prefixed(console.debug),
  info: prefixed(console.info),
  debug: prefixed(console.debug),
  prompt: prefixed(console.debug),
  http: prefixed(console.debug),
  verbose: prefixed(console.debug),
  input: prefixed(console.debug),
  silly: prefixed(console.debug),
};

/* ─── Agent loop execution ─── */

type WriteEvent = (event: Record<string, unknown>) => void;

async function runAgentExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent
): Promise<void> {
  log.info(`agent start model=${payload.modelId} msgs=${payload.messages.length} tools=${Object.keys(allTools).length} prompt=${(payload.systemPrompt ?? '').slice(0, 80)}`);

  const result = await executeAgentLoop(
    {
      systemPrompt: payload.systemPrompt ?? '',
      context: payload.context ?? '',
      messages: payload.messages,
      apiKey: payload.apiKey,
      modelId: payload.modelId,
      maxSteps: payload.maxSteps ?? null,
      tools: injectSystemTools({ existingTools: allTools, isChildAgent: payload.isChildAgent ?? false }),
      isChildAgent: payload.isChildAgent ?? false,
    },
    {
      onStepStarted: (step: number) => {
        log.debug(`step ${step} started`);
        write({ type: 'step_started', step });
      },
      onStepProcessed: (event: AgentStepEvent) => {
        log.info(`step ${event.step} done text=${event.responseText.length}chars tools=${event.toolCalls.length} tokens=${JSON.stringify(event.tokens)} dur=${event.durationMs}ms`);
        write({
          type: 'step_processed',
          step: event.step,
          responseText: event.responseText,
          responseMessages: event.responseMessages,
          reasoning: event.reasoning,
          toolCalls: event.toolCalls,
          tokens: event.tokens,
          durationMs: event.durationMs,
          error: event.error,
        });
      },
    },
    runnerLogger
  );

  log.info(`agent done text=${result.finalText.length}chars steps=${result.steps} tokens=${JSON.stringify(result.totalTokens)}`);

  write({
    type: 'agent_response',
    text: result.finalText,
    steps: result.steps,
    totalTokens: result.totalTokens,
    toolCalls: result.toolCalls,
    tokensLogs: result.tokensLogs,
    finishResult: result.finishResult,
    dispatchResult: result.dispatchResult,
  });
}

/* ─── Workflow execution ─── */

async function runWorkflowExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent
): Promise<void> {
  const context = buildContext(payload);

  const result = await executeWithCallbacks({
    context,
    logger: runnerLogger,
    messages: payload.messages,
    currentNode: payload.currentNodeId,
    toolsOverride: injectSystemTools({ existingTools: allTools, isChildAgent: false }),
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
        responseMessages: event.responseMessages,
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
      dispatchResult: result.dispatchResult,
      finishResult: result.finishResult,
    });
  }
}

/* ─── Main handler ─── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: SSE_HEADERS });
  }

  const authError = authenticateRequest(req);
  if (authError !== null) return authError;

  const payload: ExecutePayload = await req.json();
  const isAgent = payload.appType === 'agent';
  log.info(`request appType=${payload.appType ?? 'workflow'} model=${payload.modelId}`);
  const mcpServers = isAgent ? [] : (payload.graph.mcpServers ?? []);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write: WriteEvent = (event) => {
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
        const allTools: Record<string, Tool> = { ...validation.success.tools };

        if (!isAgent) {
          const vfsResult = await bootstrapVfs(payload, buildContext(payload));
          if (vfsResult !== null) {
            Object.assign(allTools, vfsResult.tools);
          }
        }

        if (isAgent) {
          await runAgentExecution(payload, allTools, write);
        } else {
          await runWorkflowExecution(payload, allTools, write);
        }

        write({ type: 'execution_complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Execution failed';
        log.error(message);
        write({ type: 'error', message });
      } finally {
        await closeMcpClients(clients);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
