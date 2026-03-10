import type { Request } from 'express';

import { assembleGraph } from '../../db/queries/graphQueries.js';
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

export async function handleGetGraph(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const { supabase }: AuthenticatedLocals = res.locals;

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const graph = await assembleGraph(supabase, agentId);

    if (graph === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
      return;
    }

    res.status(HTTP_OK).json(graph);
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
