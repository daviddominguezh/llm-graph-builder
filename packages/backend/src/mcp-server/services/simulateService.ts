import type { Graph } from '@daviddh/graph-types';

import { getAgentBySlug } from '../../db/queries/agentQueries.js';
import { getDecryptedApiKeyValue, getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import { closeMcpSession, createMcpSession } from '../../mcp/lifecycle.js';
import type { ServiceContext } from '../types.js';
import { requireGraph } from './graphReadHelpers.js';
import { resolveMcpEnvVars, toRunnerMessages, toSimulationResult } from './simulateHelpers.js';
import type { RunSimulationFn, SimulateInput, SimulationResult } from './simulateTypes.js';

export type { SimulateInput, SimulationResult } from './simulateTypes.js';

/* ------------------------------------------------------------------ */
/*  Fetch staging API key                                              */
/* ------------------------------------------------------------------ */

async function fetchStagingApiKey(ctx: ServiceContext, agentSlug: string): Promise<string> {
  const { result, error } = await getAgentBySlug(ctx.supabase, agentSlug);
  if (error !== null || result === null) throw new Error(`Agent not found: ${agentSlug}`);
  const { staging_api_key_id: keyId } = result;
  if (keyId === null) throw new Error('No staging API key configured for this agent');
  const value = await getDecryptedApiKeyValue(ctx.supabase, keyId);
  if (value === null) throw new Error('Failed to decrypt staging API key');
  return value;
}

/* ------------------------------------------------------------------ */
/*  Prepare graph with resolved env variables                          */
/* ------------------------------------------------------------------ */

async function prepareGraph(
  ctx: ServiceContext,
  agentId: string
): Promise<{ graph: Graph; envVars: Record<string, string> }> {
  const raw = await assembleGraph(ctx.supabase, agentId);
  const graph = requireGraph(raw, agentId);
  const envVars = await getDecryptedEnvVariables(ctx.supabase, ctx.orgId);
  return { graph: resolveMcpEnvVars(graph, envVars), envVars };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/* ------------------------------------------------------------------ */
/*  simulateAgent params                                               */
/* ------------------------------------------------------------------ */

export interface SimulateAgentParams {
  ctx: ServiceContext;
  agentId: string;
  agentSlug: string;
  input: SimulateInput;
}

/* ------------------------------------------------------------------ */
/*  simulateAgent                                                      */
/* ------------------------------------------------------------------ */

export async function simulateAgent(
  params: SimulateAgentParams,
  runSimulation: RunSimulationFn
): Promise<SimulationResult> {
  const { ctx, agentId, agentSlug, input } = params;
  const [apiKey, prepared] = await Promise.all([
    fetchStagingApiKey(ctx, agentSlug),
    prepareGraph(ctx, agentId),
  ]);

  const { graph } = prepared;
  const mcpServers = graph.mcpServers ?? [];
  const session = await createMcpSession(mcpServers);

  try {
    const output = await runSimulation({
      graph,
      apiKey,
      modelId: input.modelId ?? DEFAULT_MODEL,
      messages: toRunnerMessages(input),
      currentNode: input.currentNode,
      session,
      data: input.data ?? {},
    });
    return toSimulationResult(output);
  } finally {
    await closeMcpSession(session);
  }
}
