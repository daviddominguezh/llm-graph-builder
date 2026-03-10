import type { CallAgentOutput } from '@daviddh/llm-graph-runner';
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

function sendAgentResponse(res: Response, result: CallAgentOutput): void {
  const tokenUsage = sumTokens(result);
  writeSSE(res, {
    type: 'agent_response',
    text: result.text ?? '',
    visitedNodes: result.visitedNodes,
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
    onNodeVisited: (nodeId: string) => {
      sendNodeVisited(res, nodeId);
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
  console.log('[simulate] POST /simulate received');
  console.log('[simulate] currentNode:', body.currentNode);
  console.log('[simulate] messages count:', body.messages?.length ?? 0);
  console.log('[simulate] graph nodes:', body.graph?.nodes?.length ?? 0);
  console.log('[simulate] mcpServers:', body.graph?.mcpServers?.length ?? 0);
  const mcpServers = body.graph.mcpServers ?? [];
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    console.log('[simulate] Creating MCP session...');
    session = await createMcpSession(mcpServers);
    console.log('[simulate] MCP session created, tools:', Object.keys(session.tools).length);
    console.log('[simulate] Running simulation...');
    await runSimulation(body, session, res);
    console.log('[simulate] Simulation complete');
    writeSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    console.error('[simulate] Error:', err);
    sendError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
