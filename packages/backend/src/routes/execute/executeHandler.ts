import type { CallAgentOutput, Message } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { failExecution } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getAgentVfsSettings } from '../../db/queries/vfsConfigQueries.js';
import type { ExecuteAgentParams, NodeProcessedData, VfsEdgeFunctionPayload } from './edgeFunctionClient.js';
import { executeAgent } from './edgeFunctionClient.js';
import { routeAgentExecution } from './executeAgentPath.js';
import type { ExecutionAuthLocals, ExecutionAuthResponse } from './executeAuth.js';
import {
  type FetchedData,
  HttpError,
  fetchAgentConfig,
  fetchGraphAndKeys,
  fetchSessionData,
  getProductionKeyId,
} from './executeFetcher.js';
import {
  buildUserMessage,
  extractTextFromInput,
  resolveMcpTransportVariables,
  resolveOAuthForExecution,
  sendNodeProcessedEvent,
  sendNodeVisitedEvent,
  setSseHeaders,
  writePublicSSE,
} from './executeHelpers.js';
import { persistPostExecution, persistPreExecution } from './executePersistence.js';
import {
  buildAgentResponse,
  buildEmptyResponse,
  getLastVisitedNode,
  mergeStructuredOutputs,
} from './executeResponseBuilders.js';
import type { AgentExecutionInput } from './executeTypes.js';
import { AgentExecutionInputSchema } from './executeTypes.js';
import { buildVfsPayload } from './vfsDispatch.js';

const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

/* ─── Execution context ─── */
interface ExecutionContext {
  supabase: SupabaseClient;
  input: AgentExecutionInput;
  agentId: string;
  orgId: string;
  version: number;
  model: string;
  fetched: FetchedData;
  userMessage: Message;
  executionId: string;
  vfsPayload?: VfsEdgeFunctionPayload;
}

/* ─── Params builder ─── */
function buildExecuteParams(ctx: ExecutionContext): ExecuteAgentParams {
  return {
    graph: ctx.fetched.graph,
    apiKey: ctx.fetched.apiKey,
    modelId: ctx.model,
    currentNodeId: ctx.fetched.currentNodeId,
    messages: ctx.fetched.messageHistory,
    structuredOutputs: ctx.fetched.structuredOutputs,
    data: ctx.input.context ?? {},
    quickReplies: {},
    sessionID: ctx.input.sessionId,
    tenantID: ctx.input.tenantId,
    userID: ctx.input.userId,
    isFirstMessage: ctx.fetched.isNew,
    vfs: ctx.vfsPayload,
  };
}

/* ─── Data fetching ─── */
interface FetchAllParams {
  supabase: SupabaseClient;
  agentId: string;
  orgId: string;
  version: number;
  input: AgentExecutionInput;
  model: string;
}

async function fetchAllData(params: FetchAllParams): Promise<FetchedData> {
  const { supabase, agentId, orgId, version, input, model } = params;
  const productionKeyId = await getProductionKeyId(supabase, agentId);
  const [graphAndKeys, sessionData, vfsSettings] = await Promise.all([
    fetchGraphAndKeys({ supabase, agentId, version, orgId, productionApiKeyId: productionKeyId }),
    fetchSessionData({ supabase, agentId, orgId, version, input, model }),
    getAgentVfsSettings(supabase, agentId),
  ]);
  const envResolvedGraph = resolveMcpTransportVariables(
    graphAndKeys.graph,
    graphAndKeys.envVars.byName,
    graphAndKeys.envVars.byId
  );
  const resolvedGraph = await resolveOAuthForExecution(supabase, envResolvedGraph, orgId);
  const agentConfig =
    graphAndKeys.appType === 'agent' ? await fetchAgentConfig(supabase, agentId, version) : null;
  return { ...graphAndKeys, ...sessionData, graph: resolvedGraph, agentConfig, vfsSettings };
}

/* ─── VFS payload resolution ─── */
async function resolveVfsPayload(
  supabase: SupabaseClient,
  fetched: FetchedData,
  agentId: string,
  orgId: string
): Promise<VfsEdgeFunctionPayload | undefined> {
  if (fetched.vfsSettings === null) return undefined;
  const payload = await buildVfsPayload(supabase, {
    agentId,
    orgId,
    vfsSettings: fetched.vfsSettings,
    userJwt: '',
    ref: undefined,
  });
  return { ...payload, settings: payload.settings as Record<string, unknown> };
}

/* ─── Preparation ─── */
async function prepareExecution(
  req: Request<{ agentSlug: string; version: string }>,
  res: ExecutionAuthResponse
): Promise<ExecutionContext> {
  const parsed = AgentExecutionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(HTTP_BAD_REQUEST, parsed.error.message);

  const { data: input } = parsed;
  const { orgId, agentId, version, supabase }: ExecutionAuthLocals = res.locals;
  const model = input.model ?? DEFAULT_MODEL;

  const fetched = await fetchAllData({ supabase, agentId, orgId, version, input, model });
  const userMessage = buildUserMessage(input);
  fetched.messageHistory = [...fetched.messageHistory, userMessage];

  const [{ executionId }, vfsPayload] = await Promise.all([
    persistPreExecution(supabase, {
      sessionDbId: fetched.sessionDbId,
      agentId,
      orgId,
      version,
      model,
      channel: input.channel,
      tenantId: input.tenantId,
      userId: input.userId,
      userMessageContent: extractTextFromInput(input),
      currentNodeId: fetched.currentNodeId,
    }),
    resolveVfsPayload(supabase, fetched, agentId, orgId),
  ]);

  return { supabase, input, agentId, orgId, version, model, fetched, userMessage, executionId, vfsPayload };
}

/* ─── Post-execution persistence ─── */
async function persistResult(
  ctx: ExecutionContext,
  result: CallAgentOutput,
  startTime: number,
  nodeData: NodeProcessedData[]
): Promise<void> {
  const durationMs = Date.now() - startTime;
  const newNodeId = getLastVisitedNode(result, ctx.fetched.currentNodeId);
  const newOutputs = mergeStructuredOutputs(ctx.fetched.structuredOutputs, result);

  await persistPostExecution(ctx.supabase, {
    executionId: ctx.executionId,
    sessionDbId: ctx.fetched.sessionDbId,
    result,
    currentNodeId: newNodeId,
    structuredOutputs: newOutputs,
    durationMs,
    model: ctx.model,
    nodeData,
  });
}

/* ─── Streaming handler ─── */
function noop(): void {
  // intentionally empty — used as no-op callback
}

async function handleStreaming(ctx: ExecutionContext, res: Response): Promise<void> {
  setSseHeaders(res);
  const startTime = Date.now();
  const { output, nodeData } = await executeAgent(buildExecuteParams(ctx), {
    onNodeVisited: (nodeId) => {
      sendNodeVisitedEvent(res, nodeId);
    },
    onNodeProcessed: (event) => {
      sendNodeProcessedEvent(res, event);
    },
  });

  if (output !== null) {
    const response = buildAgentResponse(output, Date.now() - startTime);
    writePublicSSE(res, { type: 'done', response });
    await persistResult(ctx, output, startTime, nodeData);
  }
}

/* ─── Non-streaming handler ─── */
async function handleNonStreaming(ctx: ExecutionContext, res: Response): Promise<void> {
  const startTime = Date.now();
  const { output, nodeData } = await executeAgent(buildExecuteParams(ctx), {
    onNodeVisited: noop,
    onNodeProcessed: noop,
  });

  if (output !== null) {
    res.json(buildAgentResponse(output, Date.now() - startTime));
    await persistResult(ctx, output, startTime, nodeData);
    return;
  }

  res.json(buildEmptyResponse());
}

/* ─── Error handler ─── */
async function handleExecutionError(
  err: unknown,
  executionId: string | undefined,
  supabase: SupabaseClient | undefined,
  res: Response
): Promise<void> {
  const message = err instanceof Error ? err.message : 'Execution failed';
  const status = err instanceof HttpError ? err.status : HTTP_INTERNAL;

  if (executionId !== undefined && supabase !== undefined) {
    try {
      await failExecution(supabase, executionId, message);
    } catch {
      process.stdout.write('[execute] failExecution error ignored\n');
    }
  }

  if (res.headersSent) {
    writePublicSSE(res, { type: 'error', message });
  } else {
    res.status(status).json({ error: message });
  }
}

export async function handleExecute(
  req: Request<{ agentSlug: string; version: string }>,
  res: ExecutionAuthResponse
): Promise<void> {
  let executionId: string | undefined = undefined;
  let supabase: SupabaseClient | undefined = undefined;

  try {
    const ctx = await prepareExecution(req, res);
    ({ executionId } = ctx);
    ({ supabase } = ctx);

    if (ctx.fetched.appType === 'agent') {
      await routeAgentExecution(
        {
          supabase: ctx.supabase,
          executionId: ctx.executionId,
          fetched: ctx.fetched,
          model: ctx.model,
          stream: ctx.input.stream,
        },
        res
      );
    } else if (ctx.input.stream) {
      await handleStreaming(ctx, res);
    } else {
      await handleNonStreaming(ctx, res);
    }
  } catch (err) {
    await handleExecutionError(err, executionId, supabase, res);
  } finally {
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  }
}
