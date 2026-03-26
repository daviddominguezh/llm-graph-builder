import type { Request } from 'express';

import { syncTemplateAfterPublish } from '../../db/queries/templateSync.js';
import { publishVersion } from '../../db/queries/versionQueries.js';
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
  process.stderr.write(`[postPublish] ERROR agent=${agentId}: ${message}\n`);
}

export async function handlePostPublish(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const version = await publishVersion(supabase, agentId);
    await syncTemplateAfterPublish(supabase, agentId).catch((syncErr: unknown) => {
      logError(agentId, `template sync failed: ${extractErrorMessage(syncErr)}`);
    });
    res.status(HTTP_OK).json({ version });
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
