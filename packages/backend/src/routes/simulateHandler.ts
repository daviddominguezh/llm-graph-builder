import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import { executeWithCallbacks, injectSystemTools } from '@daviddh/llm-graph-runner';
import type { Tool } from 'ai';
import type { Request, Response } from 'express';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { consoleLogger } from '../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import type { SimulateRequest } from '../types.js';
import { buildContext, setSseHeaders, sumTokens, writeSSE } from './simulate.js';
import { wrapDispatchToolsForSimulation } from './simulateWorkflowDispatch.js';

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };

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

function buildToolsForWorkflowSim(session: McpSession, body: SimulateRequest): Record<string, Tool> {
  const base = injectSystemTools({ existingTools: session.tools, isChildAgent: false });
  const supabase = createServiceClient();
  return wrapDispatchToolsForSimulation(base, {
    supabase,
    orgId: body.orgId ?? '',
    parentApiKey: body.apiKey,
    parentModelId: body.modelId,
    parentSession: session,
  });
}

async function runSimulation(body: SimulateRequest, session: McpSession, res: Response): Promise<void> {
  const context = buildContext(body);
  const result = await executeWithCallbacks({
    context,
    messages: body.messages,
    currentNode: body.currentNode,
    toolsOverride: buildToolsForWorkflowSim(session, body),
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
    sendAgentResponse(res, result);
  }
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
    session = await createMcpSession(mcpServers);
    await runSimulation(body, session, res);
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
