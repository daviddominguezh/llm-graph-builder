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

export async function handleSimulateAgent(
  req: Request<Record<string, string>, unknown, unknown>,
  res: Response
): Promise<void> {
  const parsed = SimulateAgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  const body = req.body as SimulateAgentRequest;
  const mcpServers = body.mcpServers ?? [];
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    session = await createMcpSession(mcpServers);
    await runAgentSimulation(body, session, res);
    writeAgentSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    sendAgentError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}
