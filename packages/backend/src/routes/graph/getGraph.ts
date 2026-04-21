import type { Request } from 'express';

import { assembleAgentConfig, isAgentType } from '../../db/queries/agentConfigQueries.js';
import { assembleGraph } from '../../db/queries/graphQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

function logError(agentId: string, message: string): void {
  process.stderr.write(`[getGraph] ERROR agent=${agentId}: ${message}\n`);
}

async function respondWithAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const config = await assembleAgentConfig(supabase, agentId);
  if (config === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
    return;
  }
  res.status(HTTP_OK).json(config);
}

async function respondWithGraph(
  supabase: SupabaseClient,
  agentId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const graph = await assembleGraph(supabase, agentId);
  if (graph === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
    return;
  }
  res.status(HTTP_OK).json(graph);
}

export async function handleGetGraph(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const { supabase }: AuthenticatedLocals = res.locals;

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const isAgent = await isAgentType(supabase, agentId);
    if (isAgent) {
      await respondWithAgentConfig(supabase, agentId, res);
      return;
    }
    await respondWithGraph(supabase, agentId, res);
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
