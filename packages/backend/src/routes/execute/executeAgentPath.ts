import type { AgentLoopResult, AgentStepEvent } from '@daviddh/llm-graph-runner';
import { executeAgentLoop } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../../mcp/lifecycle.js';
import { persistAgentPostExecution } from './agentExecutionPersistence.js';
import type { AgentConfig, FetchedData } from './executeFetcher.js';
import { HttpError } from './executeFetcher.js';
import { setSseHeaders, writePublicSSE } from './executeHelpers.js';
import type { AgentExecutionResponse } from './executeTypes.js';

const ZERO = 0;
const EMPTY_SESSION: McpSession = { clients: [], tools: {} };
const HTTP_INTERNAL = 500;

/* ─── Response builders ─── */
function buildAgentExecResponse(result: AgentLoopResult, durationMs: number): AgentExecutionResponse {
  const { totalTokens } = result;
  return {
    text: result.finalText,
    currentNodeId: '',
    visitedNodes: [],
    toolCalls: result.toolCalls.map((tc) => ({ name: tc.toolName, args: tc.input, result: tc.output })),
    structuredOutputs: {},
    tokenUsage: {
      inputTokens: totalTokens.input,
      outputTokens: totalTokens.output,
      cachedTokens: totalTokens.cached,
      totalCost: totalTokens.costUSD ?? ZERO,
    },
    durationMs,
  };
}

/* ─── Agent execution context ─── */
interface AgentExecContext {
  supabase: SupabaseClient;
  executionId: string;
  sessionDbId: string;
  model: string;
  agentConfig: AgentConfig;
  fetched: FetchedData;
}

/* ─── MCP session helper ─── */
async function createAgentMcpSession(fetched: FetchedData): Promise<McpSession> {
  const { graph } = fetched;
  const { mcpServers } = graph;
  if (mcpServers === undefined || mcpServers.length === ZERO) return EMPTY_SESSION;
  return await createMcpSession(mcpServers);
}

/* ─── Core agent execution ─── */
interface AgentRunResult {
  loopResult: AgentLoopResult;
  stepEvents: AgentStepEvent[];
}

async function runAgentLoop(
  ctx: AgentExecContext,
  session: McpSession,
  onStepStarted?: (step: number) => void
): Promise<AgentRunResult> {
  const stepEvents: AgentStepEvent[] = [];
  const loopResult = await executeAgentLoop(
    {
      systemPrompt: ctx.agentConfig.systemPrompt,
      context: ctx.agentConfig.context,
      messages: ctx.fetched.messageHistory,
      apiKey: ctx.fetched.apiKey,
      modelId: ctx.model,
      maxSteps: ctx.agentConfig.maxSteps,
      tools: session.tools,
    },
    {
      onStepStarted,
      onStepProcessed: (event) => {
        stepEvents.push(event);
      },
    }
  );
  return { loopResult, stepEvents };
}

async function persistAgentResult(
  ctx: AgentExecContext,
  result: AgentLoopResult,
  stepEvents: AgentStepEvent[],
  durationMs: number
): Promise<void> {
  await persistAgentPostExecution(ctx.supabase, {
    executionId: ctx.executionId,
    sessionDbId: ctx.sessionDbId,
    agentResult: result,
    stepEvents,
    currentNodeId: '',
    structuredOutputs: {},
    durationMs,
    model: ctx.model,
  });
}

/* ─── Streaming handler ─── */
async function handleAgentStreaming(ctx: AgentExecContext, res: Response): Promise<void> {
  setSseHeaders(res);
  const startTime = Date.now();
  let session: McpSession = EMPTY_SESSION;
  try {
    session = await createAgentMcpSession(ctx.fetched);
    const { loopResult, stepEvents } = await runAgentLoop(ctx, session, (step) => {
      writePublicSSE(res, { type: 'node_visited', nodeId: `step-${String(step)}` });
    });
    const durationMs = Date.now() - startTime;
    const response = buildAgentExecResponse(loopResult, durationMs);
    writePublicSSE(res, { type: 'done', response });
    await persistAgentResult(ctx, loopResult, stepEvents, durationMs);
  } finally {
    await closeMcpSession(session);
  }
}

/* ─── Non-streaming handler ─── */
async function handleAgentNonStreaming(ctx: AgentExecContext, res: Response): Promise<void> {
  const startTime = Date.now();
  let session: McpSession = EMPTY_SESSION;
  try {
    session = await createAgentMcpSession(ctx.fetched);
    const { loopResult, stepEvents } = await runAgentLoop(ctx, session);
    const durationMs = Date.now() - startTime;
    res.json(buildAgentExecResponse(loopResult, durationMs));
    await persistAgentResult(ctx, loopResult, stepEvents, durationMs);
  } finally {
    await closeMcpSession(session);
  }
}

/* ─── Public routing function ─── */
export interface RouteAgentParams {
  supabase: SupabaseClient;
  executionId: string;
  fetched: FetchedData;
  model: string;
  stream: boolean;
}

export async function routeAgentExecution(params: RouteAgentParams, res: Response): Promise<void> {
  const { agentConfig } = params.fetched;
  if (agentConfig === null) throw new HttpError(HTTP_INTERNAL, 'Agent config not found');
  const ctx: AgentExecContext = {
    supabase: params.supabase,
    executionId: params.executionId,
    sessionDbId: params.fetched.sessionDbId,
    model: params.model,
    agentConfig,
    fetched: params.fetched,
  };
  if (params.stream) {
    await handleAgentStreaming(ctx, res);
  } else {
    await handleAgentNonStreaming(ctx, res);
  }
}
