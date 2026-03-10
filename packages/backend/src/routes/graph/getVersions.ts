import type { Request } from 'express';

import { listVersions } from '../../db/queries/versionQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

function logError(agentId: string, message: string): void {
  process.stderr.write(`[getVersions] ERROR agent=${agentId}: ${message}\n`);
}

export async function handleGetVersions(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const versions = await listVersions(supabase, agentId);
    res.status(HTTP_OK).json({ versions });
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
