// Supabase Edge Function — Stateless Agent Executor
// Receives complete payload, executes agent via @daviddh/llm-graph-runner, streams SSE events back.
// No DB access, no secrets resolution — all provided in the payload.
import type {
  AgentStepEvent,
  BuiltinBundles,
  CallAgentOutput,
  Context,
  NodeProcessedEvent,
} from '@daviddh/llm-graph-runner';
import { VFSContext, executeAgentLoop, executeWithCallbacks, generateVFSTools } from '@daviddh/llm-graph-runner';
import { GitHubSourceProvider } from '@daviddh/vfs-providers';
import type { Tool } from 'ai';

import {
  type ExecutePayload,
  type VfsPayloadData,
  buildBaseContext,
  buildProviderCtx,
  buildRegistry,
  buildSupabaseClient,
  buildToolsForAgentV2,
  prepareAllBundles,
  runnerLogger,
} from './toolBuilder.ts';

const SSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-master-key',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

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

const CURRENT_SCHEMA_VERSION = 2;

function validateSchemaVersion(schemaVersion: unknown): Response | null {
  if (schemaVersion === undefined) return null;
  if (schemaVersion === CURRENT_SCHEMA_VERSION) return null;
  return new Response(JSON.stringify({ error: `unsupported schemaVersion: ${String(schemaVersion)}` }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
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

/* ─── Agent loop execution ─── */

type WriteEvent = (event: Record<string, unknown>) => void;

interface RunAgentArgs {
  payload: ExecutePayload;
  write: WriteEvent;
  conversationId?: string;
  bundles: BuiltinBundles;
}

async function runAgentExecution(args: RunAgentArgs): Promise<void> {
  const { payload, write, conversationId, bundles } = args;
  log.info(
    `agent start model=${payload.modelId} msgs=${payload.messages.length} prompt=${(payload.systemPrompt ?? '').slice(0, 80)}`
  );

  const tools = await buildToolsForAgentV2({
    payload,
    conversationId,
    bundles,
  });

  const result = await executeAgentLoop(
    {
      systemPrompt: payload.systemPrompt ?? '',
      context: payload.context ?? '',
      messages: payload.messages,
      apiKey: payload.apiKey,
      modelId: payload.modelId,
      maxSteps: payload.maxSteps ?? null,
      skills: payload.skills,
      tools,
      isChildAgent: payload.isChildAgent ?? false,
    },
    {
      onStepStarted: (step: number) => {
        log.debug(`step ${step} started`);
        write({ type: 'step_started', step });
      },
      onStepProcessed: (event: AgentStepEvent) => {
        log.info(
          `step ${event.step} done text=${event.responseText.length}chars tools=${event.toolCalls.length} tokens=${JSON.stringify(event.tokens)} dur=${event.durationMs}ms`
        );
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

  log.info(
    `agent done text=${result.finalText.length}chars steps=${result.steps} tokens=${JSON.stringify(result.totalTokens)}`
  );

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

interface WorkflowToolsBundle {
  conversationId?: string;
  bundles: BuiltinBundles;
}

function buildWorkflowContext(
  payload: ExecutePayload,
  baseContext: Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'>,
  bundle: WorkflowToolsBundle
): Context {
  const registry = buildRegistry(payload);
  const ctx = buildProviderCtx({
    payload,
    conversationId: bundle.conversationId,
    bundles: bundle.bundles,
  });
  return {
    ...baseContext,
    registry,
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    isChildAgent: ctx.isChildAgent,
    conversationId: ctx.conversationId,
    contextData: ctx.contextData,
    oauthTokens: ctx.oauthTokens,
    mcpServers: ctx.mcpServers,
    services: ctx.services,
    logger: runnerLogger,
  };
}

interface RunWorkflowArgs {
  payload: ExecutePayload;
  write: WriteEvent;
  conversationId?: string;
  bundles: BuiltinBundles;
}

async function runWorkflowExecution(args: RunWorkflowArgs): Promise<void> {
  const { payload, write, conversationId, bundles } = args;
  const baseContext = buildBaseContext(payload);
  const bundle: WorkflowToolsBundle = {
    conversationId,
    bundles,
  };
  const context: Context = buildWorkflowContext(payload, baseContext, bundle);

  const result = await executeWithCallbacks({
    context,
    logger: runnerLogger,
    messages: payload.messages,
    currentNode: payload.currentNodeId,
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
  const schemaVersionError = validateSchemaVersion(payload.schemaVersion);
  if (schemaVersionError !== null) return schemaVersionError;
  const isAgent = payload.appType === 'agent';
  log.info(
    `request appType=${payload.appType ?? 'workflow'} model=${payload.modelId} schemaVersion=${payload.schemaVersion ?? CURRENT_SCHEMA_VERSION}`
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write: WriteEvent = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (!isAgent) {
          // VFS tools are wired into the runner's Context; the workflow path uses them via
          // the registry. Bootstrap is currently still a side-effect (initialising VFSContext).
          await bootstrapVfs(payload, buildBaseContext(payload));
        }

        const supabase = await buildSupabaseClient();
        const bundles = await prepareAllBundles(payload, supabase);

        if (isAgent) {
          await runAgentExecution({
            payload,
            write,
            conversationId: payload.conversationId,
            bundles,
          });
        } else {
          await runWorkflowExecution({
            payload,
            write,
            conversationId: payload.conversationId,
            bundles,
          });
        }

        write({ type: 'execution_complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Execution failed';
        log.error(message);
        write({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
