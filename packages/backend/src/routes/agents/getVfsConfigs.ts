import type { Request } from 'express';

import { getVfsConfigsByAgent } from '../../db/queries/vfsConfigQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

export async function handleGetVfsConfigs(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const configs = await getVfsConfigsByAgent(supabase, agentId);
    res.json(configs);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
