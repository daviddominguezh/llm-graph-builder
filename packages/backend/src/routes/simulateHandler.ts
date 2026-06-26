import type { McpServerConfig } from '@daviddh/graph-types';
import type {
  CallAgentOutput,
  Context,
  NodeProcessedEvent,
  OAuthTokenBundle,
} from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { assertEgressForServers } from '../lib/assertEgressForServers.js';
import { classifyDiscoveryError } from '../lib/discoveryError.js';
import { consoleLogger } from '../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import { makeNoStoreBoundKvServices, makeNoStoreBoundRagServices } from '../services/noStoreBoundServices.js';
import type { SimulateRequest } from '../types.js';
import { buildContext, setSseHeaders, sumTokens, writeSSE } from './simulate.js';
import { resolveChildConfig } from './simulateChildResolver.js';
import { buildSimulationProviderCtx, buildSimulationRegistry } from './simulationProviderCtx.js';

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };
const CHILD_DEPTH = 1;
const ROOT_DEPTH = 0;

function extractTaskFromParams(params: Record<string, unknown>): string {
  const raw = params.task ?? params.user_said ?? '';
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

function findDispatchToolCallId(result: CallAgentOutput, dispatchType: string): string {
  const match = result.toolCalls.find((tc) => tc.toolName === dispatchType);
  return match?.toolCallId ?? randomUUID();
}

async function emitChildDispatched(res: Response, result: CallAgentOutput, orgId: string): Promise<void> {
  const { dispatchResult: dispatch } = result;
  if (dispatch === undefined) return;
  const task = extractTaskFromParams(dispatch.params);
  const parentToolCallId = findDispatchToolCallId(result, dispatch.type);
  const supabase = createServiceClient();
  try {
    const childConfig = await resolveChildConfig({
      supabase,
      dispatchType: dispatch.type,
      params: dispatch.params,
      orgId,
    });
    writeSSE(res, {
      type: 'child_dispatched',
      depth: CHILD_DEPTH,
      parentDepth: ROOT_DEPTH,
      dispatchType: dispatch.type,
      task,
      parentToolCallId,
      toolName: dispatch.type,
      params: dispatch.params,
      childConfig: {
        systemPrompt: childConfig.systemPrompt,
        context: childConfig.context,
        modelId: childConfig.modelId,
        maxSteps: childConfig.maxSteps,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve child config';
    writeSSE(res, { type: 'error', message: msg });
  }
}

function sendNodeVisited(res: Response, nodeId: string): void {
  writeSSE(res, { type: 'node_visited', nodeId });
}

function sendNodeProcessed(res: Response, event: NodeProcessedEvent): void {
  writeSSE(res, {
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
}

function extractToolCalls(
  result: CallAgentOutput
): Array<{ toolName: string; input: unknown; output: unknown }> {
  return result.toolCalls.map((tc) => ({
    toolName: tc.toolName,
    input: tc.input as unknown,
    output: undefined,
  }));
}

function extractNodeTokens(
  result: CallAgentOutput
): Array<{ node: string; tokens: { input: number; output: number; cached: number } }> {
  return result.tokensLogs.map((log) => ({
    node: log.action,
    tokens: log.tokens,
  }));
}

function sendAgentResponse(res: Response, result: CallAgentOutput): void {
  const tokenUsage = sumTokens(result);
  writeSSE(res, {
    type: 'agent_response',
    text: result.text ?? '',
    visitedNodes: result.visitedNodes,
    toolCalls: extractToolCalls(result),
    nodeTokens: extractNodeTokens(result),
    tokenUsage,
  });
}

function sendError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Simulation failed';
  writeSSE(res, { type: 'error', message });
}

/**
 * Redacted error for egress-guard failures on the direct-connect path: surfaces
 * ONLY the closed-taxonomy category (never the raw message, URL, or host, which
 * can carry secrets / probe targets).
 */
function sendRedactedError(res: Response, err: unknown): void {
  writeSSE(res, {
    type: 'error',
    message: 'MCP server unreachable',
    errorCategory: classifyDiscoveryError(err),
  });
}

function buildSimulationServicesResolver(): (providerId: string) => unknown {
  return (providerId: string): unknown => {
    // simulate has no per-agent store bindings — surface the sentinel services
    // so the LLM still sees the tools and gets a `no_store_bound` ToolError if
    // it tries to call one.
    if (providerId === 'kv_store') return makeNoStoreBoundKvServices();
    if (providerId === 'rag') return makeNoStoreBoundRagServices();
    return undefined;
  };
}

function buildContextWithRegistry(body: SimulateRequest): Omit<Context, 'toolsOverride' | 'onNodeVisited'> {
  const baseContext = buildContext(body);
  const mcpServers = body.graph.mcpServers ?? [];
  const services = buildSimulationServicesResolver();
  const oauthTokens = new Map<string, OAuthTokenBundle>();
  const providerCtx = buildSimulationProviderCtx({
    orgId: body.orgId ?? '',
    tenantId: body.tenantID,
    agentId: body.sessionID,
    isChildAgent: false,
    oauthTokens,
    mcpServers,
    services,
  });
  return {
    ...baseContext,
    registry: buildSimulationRegistry({ mcpServers }),
    orgId: providerCtx.orgId,
    agentId: providerCtx.agentId,
    isChildAgent: providerCtx.isChildAgent,
    conversationId: providerCtx.conversationId,
    contextData: providerCtx.contextData,
    oauthTokens: providerCtx.oauthTokens,
    mcpServers: providerCtx.mcpServers,
    services: providerCtx.services,
    logger: consoleLogger,
  };
}

async function runSimulation(body: SimulateRequest, res: Response): Promise<void> {
  const context = buildContextWithRegistry(body);
  const result = await executeWithCallbacks({
    context,
    messages: body.messages,
    currentNode: body.currentNode,
    logger: consoleLogger,
    structuredOutputs: body.structuredOutputs,
    onNodeVisited: (nodeId: string) => {
      sendNodeVisited(res, nodeId);
    },
    onNodeProcessed: (event: NodeProcessedEvent) => {
      sendNodeProcessed(res, event);
    },
  });
  if (result !== null) {
    if (result.dispatchResult !== undefined) {
      await emitChildDispatched(res, result, body.orgId ?? '');
    }
    sendAgentResponse(res, result);
  }
}

/**
 * Egress-guard the direct-connect path: assert every MCP server URL is publicly
 * routable BEFORE opening any session, then connect. The registry path
 * (`buildSimulationRegistry`) is guarded separately via `makeGuardedCreateTransport`,
 * so this only closes the `createMcpSession` bypass. Returns `null` (and emits a
 * redacted error) when egress is blocked — the caller must NOT connect.
 */
async function guardedCreateSession(
  mcpServers: McpServerConfig[],
  res: Response
): Promise<McpSession | null> {
  try {
    await assertEgressForServers(mcpServers);
  } catch (err) {
    process.stdout.write(`[simulate] egress blocked: ${classifyDiscoveryError(err)}\n`);
    sendRedactedError(res, err);
    return null;
  }
  return await createMcpSession(mcpServers);
}

export async function handleSimulate(
  req: Request<Record<string, string>, unknown, SimulateRequest>,
  res: Response
): Promise<void> {
  process.stdout.write(`[simulate] workflow request received, currentNode=${req.body.currentNode}\n`);
  const { body } = req;
  const mcpServers = body.graph.mcpServers ?? [];
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    const connected = await guardedCreateSession(mcpServers, res);
    if (connected === null) return;
    session = connected;
    await runSimulation(body, res);
    writeSSE(res, { type: 'simulation_complete' });
    process.stdout.write('[simulate] workflow completed\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`[simulate] workflow error: ${msg}\n`);
    sendError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
