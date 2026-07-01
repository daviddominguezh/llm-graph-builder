import type { SupabaseLike } from '@daviddh/llm-graph-runner';
import { createSimStateStore } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { type McpSession, closeMcpSession } from '../mcp/lifecycle.js';
import type { SimulateRequest } from '../types.js';
import { sendAgentError } from './simulateAgentSse.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';
import { SimulateAgentRequestSchema } from './simulateAgentTypes.js';
import { setSseHeaders } from './simulate.js';
import { guardedCreateSession, sendWorkflowError } from './simulateHandler.js';
import {
  type TurnCtx,
  buildSimServices,
  driveAgentRoot,
  driveWorkflowRoot,
} from './simulationDriverHelpers.js';
import type { OrchestratorConfig } from './simulationOrchestratorTypes.js';

const HTTP_BAD_REQUEST = 400;
const ROOT_DEPTH = 0;
const DEFAULT_MAX_NESTING_DEPTH = 10;
const EMPTY_SESSION: McpSession = { clients: [], tools: {} };

interface SimStateFields {
  simulationState?: Record<string, unknown>;
  simulationStateWritable?: boolean;
}

/**
 * The wire body of BOTH sim routes, discriminated by `appType` (RU3 T18 — the
 * server-side agent-vs-workflow routing the spec demands). The sim-state fields
 * ride on the runtime request but are not on the legacy per-engine types.
 */
export type UnifiedSimBody =
  | (SimulateAgentRequest & SimStateFields)
  | (SimulateRequest & SimStateFields & { appType?: undefined });

type UnifiedRequest = Request<Record<string, string>, unknown, UnifiedSimBody>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildSimStore(body: SimStateFields): TurnCtx['simStore'] {
  const initial = isRecord(body.simulationState) ? body.simulationState : {};
  const writable = body.simulationStateWritable !== false;
  return createSimStateStore(initial, writable);
}

function buildAgentConfig(body: SimulateAgentRequest, orgId: string): OrchestratorConfig {
  return {
    body,
    depth: body.composition?.depth ?? ROOT_DEPTH,
    maxNestingDepth: DEFAULT_MAX_NESTING_DEPTH,
    orgId,
    supabase: createServiceClient(),
  };
}

function buildTurnCtx(res: Response, body: SimStateFields, orgId: string): TurnCtx {
  // `supabase` on the services is inert on the sim path (child config resolves
  // via a fresh service client inside buildSimServices); pass an empty stand-in.
  const supabase: SupabaseLike = {};
  return { res, services: buildSimServices(supabase, orgId), simStore: buildSimStore(body) };
}

/**
 * The engine-agnostic driver behind BOTH sim routes. Routes by `appType`, builds
 * the sim-wide {@link TurnCtx} (services carry the real orgId — HARD DEP #3b),
 * and drives the selected engine through `executeTurn`. Content SSE streams live
 * via the engine closures' callbacks; the bridge's additive state/child events
 * are forwarded on the same stream (HARD DEP #1).
 */
export async function runUnifiedSimulation(body: UnifiedSimBody, res: Response): Promise<void> {
  const orgId = body.orgId ?? '';
  const ctx = buildTurnCtx(res, body, orgId);
  if (body.appType === 'agent') {
    await driveAgentRoot(ctx, buildAgentConfig(body, orgId));
    return;
  }
  await driveWorkflowRoot(ctx, body, orgId);
}

/* ─── HTTP entrypoints ─── */

async function handleWorkflowHttp(body: SimulateRequest, res: Response): Promise<void> {
  process.stdout.write(`[simulate] workflow request received, currentNode=${body.currentNode}\n`);
  setSseHeaders(res);
  let session: McpSession = EMPTY_SESSION;
  try {
    const connected = await guardedCreateSession(body.graph.mcpServers ?? [], res);
    if (connected === null) return;
    session = connected;
    await runUnifiedSimulation(body, res);
  } catch (err) {
    sendWorkflowError(res, err);
  } finally {
    await closeMcpSession(session);
    res.end();
  }
}

async function handleAgentHttp(body: SimulateAgentRequest, res: Response): Promise<void> {
  const parsed = SimulateAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  setSseHeaders(res);
  try {
    await runUnifiedSimulation(body, res);
  } catch (err) {
    sendAgentError(res, err);
  } finally {
    res.end();
  }
}

/** The ONE sim handler — backend routes by `appType` (agent vs workflow). */
export async function handleSimulateUnified(req: UnifiedRequest, res: Response): Promise<void> {
  if (req.body.appType === 'agent') {
    await handleAgentHttp(req.body, res);
    return;
  }
  await handleWorkflowHttp(req.body, res);
}

/** Thin shim: the workflow route + the pre-existing `simulateHandler` test. */
export async function handleSimulate(req: UnifiedRequest, res: Response): Promise<void> {
  await handleSimulateUnified(req, res);
}

/** Thin shim: the agent route. */
export async function handleSimulateAgent(req: UnifiedRequest, res: Response): Promise<void> {
  await handleSimulateUnified(req, res);
}
