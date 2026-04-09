import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import { executeWithCallbacks, injectSystemTools } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { consoleLogger } from '../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import type { SimulateRequest } from '../types.js';
import { buildContext, setSseHeaders, sumTokens, writeSSE } from './simulate.js';
import { resolveChildConfig } from './simulateChildResolver.js';

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };
const CHILD_DEPTH = 1;
const ROOT_DEPTH = 0;

function extractTaskFromParams(params: Record<string, unknown>): string {
  const raw = params.task ?? params.user_said ?? '';
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

async function emitChildDispatched(
  res: Response,
  dispatch: NonNullable<CallAgentOutput['dispatchResult']>,
  orgId: string,
  apiKey: string
): Promise<void> {
  const task = extractTaskFromParams(dispatch.params);
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
      parentToolCallId: '',
      toolName: dispatch.type,
      params: dispatch.params,
      childConfig: {
        systemPrompt: childConfig.systemPrompt,
        context: childConfig.context,
        modelId: childConfig.modelId,
        maxSteps: childConfig.maxSteps,
        apiKey,
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

async function runSimulation(body: SimulateRequest, session: McpSession, res: Response): Promise<void> {
  const context = buildContext(body);
  const tools = injectSystemTools({ existingTools: session.tools, isChildAgent: false });
  const result = await executeWithCallbacks({
    context,
    messages: body.messages,
    currentNode: body.currentNode,
    toolsOverride: tools,
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
      await emitChildDispatched(res, result.dispatchResult, body.orgId ?? '', body.apiKey);
    }
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
