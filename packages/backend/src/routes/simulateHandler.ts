import type { McpServerConfig } from '@daviddh/graph-types';
import type {
  CallAgentOutput,
  Context,
  NodeProcessedEvent,
  OAuthTokenBundle,
} from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { assertEgressForServers } from '../lib/assertEgressForServers.js';
import { classifyDiscoveryError } from '../lib/discoveryError.js';
import { consoleLogger } from '../logger.js';
import { type McpSession, createMcpSession } from '../mcp/lifecycle.js';
import { makeNoStoreBoundKvServices, makeNoStoreBoundRagServices } from '../services/noStoreBoundServices.js';
import type { SimulateRequest } from '../types.js';
import { buildContext, sumTokens, writeSSE } from './simulate.js';
import { resolveChildConfig } from './simulateChildResolver.js';
import { buildSimulationProviderCtx, buildSimulationRegistry } from './simulationProviderCtx.js';

export { buildSimulationMcpInvoker } from './simulateMcpInvoker.js';
export type { SimInvokerArgs, SimMcpInvokeArgs, SimMcpInvoker } from './simulateMcpInvoker.js';

const CHILD_DEPTH = 1;
const ROOT_DEPTH = 0;

function extractTaskFromParams(params: Record<string, unknown>): string {
  const raw = params.task ?? params.user_said ?? '';
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

export function findDispatchToolCallId(result: CallAgentOutput, dispatchType: string): string {
  const match = result.toolCalls.find((tc) => tc.toolName === dispatchType);
  return match?.toolCallId ?? randomUUID();
}

/**
 * Rich `child_dispatched` legacy SSE (parent metadata + resolved child config).
 * Emitted directly on the content path (RU3 T18, HARD DEP #1) — the bridge nulls
 * the runtime `child_dispatched` ExecutionEvent, so this is the sole emitter for
 * the FE's dispatched-child card.
 */
export async function emitChildDispatched(
  res: Response,
  result: CallAgentOutput,
  orgId: string
): Promise<void> {
  const { dispatchResult: dispatch } = result;
  if (dispatch === undefined) return;
  const task = extractTaskFromParams(dispatch.params);
  const parentToolCallId = findDispatchToolCallId(result, dispatch.type);
  try {
    const childConfig = await resolveChildConfig({
      supabase: createServiceClient(),
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

/** Final WORKFLOW `agent_response` legacy SSE (content path). */
export function sendWorkflowAgentResponse(res: Response, result: CallAgentOutput): void {
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

export function sendWorkflowError(res: Response, err: unknown): void {
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

export function buildContextWithRegistry(
  body: SimulateRequest
): Omit<Context, 'toolsOverride' | 'onNodeVisited'> {
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

/**
 * WORKFLOW engine step for `executeTurn`'s `runWorkflow` closure: runs one graph
 * traversal, streaming node content SSE live, and (RU3 T18) emits the rich
 * `child_dispatched` when the traversal ends on a dispatch sentinel.
 */
export async function runWorkflowStep(res: Response, body: SimulateRequest): Promise<CallAgentOutput | null> {
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
  if (result?.dispatchResult !== undefined) {
    await emitChildDispatched(res, result, body.orgId ?? '');
  }
  return result;
}

/**
 * Egress-guard the direct-connect path: assert every MCP server URL is publicly
 * routable BEFORE opening any session, then connect. Returns `null` (and emits a
 * redacted error) when egress is blocked — the caller must NOT connect.
 */
export async function guardedCreateSession(
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
