import { executeAgentLoop } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { type McpSession, closeMcpSession, createMcpSession } from '../mcp/lifecycle.js';
import { setSseHeaders } from './simulate.js';
import {
  sendAgentError,
  sendAgentResponse,
  sendStepProcessed,
  sendStepStarted,
  sendToolExecuted,
  writeAgentSSE,
} from './simulateAgentSse.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { SimulateAgentRequestSchema } from './simulateAgentTypes.js';

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };
const HTTP_BAD_REQUEST = 400;
const JSON_NO_INDENT = 0;
const PREVIEW_LENGTH = 80;
const ZERO = 0;

function log(label: string, data?: unknown): void {
  const prefix = '[simulateAgent]';
  if (data === undefined) {
    process.stderr.write(`${prefix} ${label}\n`);
    return;
  }
  process.stderr.write(`${prefix} ${label}: ${JSON.stringify(data, null, JSON_NO_INDENT)}\n`);
}

async function runAgentSimulation(
  body: SimulateAgentRequest,
  session: McpSession,
  res: Response
): Promise<void> {
  const result = await executeAgentLoop(
    {
      systemPrompt: body.systemPrompt,
      context: body.context,
      messages: body.messages,
      apiKey: body.apiKey,
      modelId: body.modelId,
      maxSteps: body.maxSteps,
      tools: session.tools,
      skills: body.skills,
    },
    {
      onStepStarted: (step: number) => {
        sendStepStarted(res, step);
      },
      onStepProcessed: (event) => {
        sendStepProcessed(res, event);
      },
      onToolExecuted: (event) => {
        sendToolExecuted(res, event);
      },
    }
  );
  sendAgentResponse(res, result);
}

function buildLogPayload(body: SimulateAgentRequest): Record<string, unknown> {
  return {
    systemPrompt: body.systemPrompt.slice(ZERO, PREVIEW_LENGTH),
    context: body.context.slice(ZERO, PREVIEW_LENGTH),
    messageCount: body.messages.length,
    mcpServerCount: body.mcpServers.length,
    modelId: body.modelId,
  };
}

export async function handleSimulateAgent(
  req: Request<Record<string, string>, unknown, SimulateAgentRequest>,
  res: Response
): Promise<void> {
  log('received request');
  const parsed = SimulateAgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    log('validation failed', { error: parsed.error.message });
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  const { body } = req;
  const { mcpServers } = body;
  log('validated', buildLogPayload(body));
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    log('creating MCP session', { serverCount: mcpServers.length });
    session = await createMcpSession(mcpServers);
    log('MCP session created', {
      toolCount: Object.keys(session.tools).length,
      toolNames: Object.keys(session.tools),
    });
    await runAgentSimulation(body, session, res);
    log('simulation complete');
    writeAgentSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    log('simulation FAILED', { error: err instanceof Error ? err.message : String(err) });
    sendAgentError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
