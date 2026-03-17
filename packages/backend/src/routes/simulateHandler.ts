import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { consoleLogger } from '../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import type { SimulateRequest } from '../types.js';
import { buildContext, setSseHeaders, sumTokens, writeSSE } from './simulate.js';

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

async function runSimulation(body: SimulateRequest, session: McpSession, res: Response): Promise<void> {
  const context = buildContext(body);
  const result = await executeWithCallbacks({
    context,
    messages: body.messages,
    currentNode: body.currentNode,
    toolsOverride: session.tools,
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
  const { body } = req;
  const mcpServers = body.graph.mcpServers ?? [];
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    session = await createMcpSession(mcpServers);
    await runSimulation(body, session, res);
    writeSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    sendError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
