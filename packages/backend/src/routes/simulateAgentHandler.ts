import type { Request, Response } from 'express';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { setSseHeaders } from './simulate.js';
import {
  sendAgentError,
  sendAgentResponse,
  sendChildDispatched,
  sendChildFinished,
  sendChildWaiting,
  sendStepProcessed,
  sendStepStarted,
  sendToolExecuted,
  writeAgentSSE,
} from './simulateAgentSse.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { SimulateAgentRequestSchema } from './simulateAgentTypes.js';
import { runSimulationOrchestration } from './simulationOrchestrator.js';
import type {
  OrchestratorCallbacks,
  OrchestratorConfig,
  OrchestratorResult,
} from './simulationOrchestratorTypes.js';

const HTTP_BAD_REQUEST = 400;
const JSON_NO_INDENT = 0;
const PREVIEW_LENGTH = 80;
const ZERO = 0;
const DEFAULT_MAX_NESTING_DEPTH = 10;

function log(label: string, data?: unknown): void {
  const prefix = '[simulateAgent]';
  if (data === undefined) {
    process.stderr.write(`${prefix} ${label}\n`);
    return;
  }
  process.stderr.write(`${prefix} ${label}: ${JSON.stringify(data, null, JSON_NO_INDENT)}\n`);
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

function buildCallbacks(res: Response): OrchestratorCallbacks {
  return {
    onStepStarted: (step, depth) => {
      sendStepStarted(res, step, depth);
    },
    onStepProcessed: (event, depth) => {
      sendStepProcessed(res, event, depth);
    },
    onToolExecuted: (event, depth) => {
      sendToolExecuted(res, event, depth);
    },
    onChildDispatched: (info) => {
      sendChildDispatched(res, info);
    },
    onChildFinished: (info) => {
      sendChildFinished(res, info);
    },
    onChildWaiting: (depth, text) => {
      sendChildWaiting(res, depth, text);
    },
  };
}

function buildOrchestratorConfig(body: SimulateAgentRequest): OrchestratorConfig {
  const depth = body.composition?.depth ?? ZERO;
  const supabase = createServiceClient();
  return {
    body,
    depth,
    maxNestingDepth: DEFAULT_MAX_NESTING_DEPTH,
    orgId: body.orgId ?? '',
    supabase,
  };
}

function handleCompletedChild(
  res: Response,
  result: OrchestratorResult & { type: 'completed' },
  depth: number
): void {
  if (result.result.finishResult === undefined) {
    sendAgentResponse(res, result.result, depth);
    return;
  }
  sendChildFinished(res, {
    depth,
    output: result.result.finishResult.output,
    status: result.result.finishResult.status,
    tokens: result.result.totalTokens,
  });
}

function handleOrchestratorResult(res: Response, result: OrchestratorResult, depth: number): void {
  if (result.type === 'completed' && depth === ZERO) {
    sendAgentResponse(res, result.result);
  } else if (result.type === 'completed') {
    handleCompletedChild(res, result, depth);
  }
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
  log('validated', buildLogPayload(body));
  setSseHeaders(res);
  try {
    const config = buildOrchestratorConfig(body);
    const callbacks = buildCallbacks(res);
    const result = await runSimulationOrchestration(config, callbacks);
    handleOrchestratorResult(res, result, config.depth);
    log('simulation complete');
    writeAgentSSE(res, { type: 'simulation_complete' });
  } catch (err) {
    log('simulation FAILED', { error: err instanceof Error ? err.message : String(err) });
    sendAgentError(res, err);
  } finally {
    res.end();
  }
}
