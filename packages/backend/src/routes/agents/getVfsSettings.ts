import type { Request } from 'express';

import { getAgentVfsSettings } from '../../db/queries/vfsConfigQueries.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_INTERNAL_ERROR, HTTP_NOT_FOUND, extractErrorMessage, getAgentId } from '../routeHelpers.js';

export async function handleGetVfsSettings(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const settings = await getAgentVfsSettings(supabase, agentId);
    res.json({ settings });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
