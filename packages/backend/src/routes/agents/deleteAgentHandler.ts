import type { Request } from 'express';

import { deleteAgent } from '../../db/queries/agentQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

export async function handleDeleteAgent(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const { error } = await deleteAgent(supabase, agentId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
