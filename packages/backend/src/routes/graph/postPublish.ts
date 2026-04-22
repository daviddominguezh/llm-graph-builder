import type { Request } from 'express';

import { isAgentType } from '../../db/queries/agentConfigQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { syncTemplateAfterPublish } from '../../db/queries/templateSync.js';
import { publishAgentVersion, publishVersion } from '../../db/queries/versionQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';
import { ensureWidgetKey } from './mintWidgetKey.js';
import { seedWidgetOriginsForAgent } from './seedWidgetOrigins.js';

function logError(agentId: string, message: string): void {
  process.stderr.write(`[postPublish] ERROR agent=${agentId}: ${message}\n`);
}

async function runSideEffects(supabase: SupabaseClient, agentId: string): Promise<void> {
  await syncTemplateAfterPublish(supabase, agentId).catch((syncErr: unknown) => {
    logError(agentId, `template sync failed: ${extractErrorMessage(syncErr)}`);
  });
  const widget = await ensureWidgetKey(supabase, agentId);
  if (widget.error !== null) {
    logError(agentId, `widget key mint failed: ${widget.error}`);
  }
  await seedWidgetOriginsForAgent(supabase, agentId).catch((seedErr: unknown) => {
    logError(agentId, `seed widget origins failed: ${extractErrorMessage(seedErr)}`);
  });
}

export async function handlePostPublish(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const isAgent = await isAgentType(supabase, agentId);
    const publishFn = isAgent ? publishAgentVersion : publishVersion;
    const version = await publishFn(supabase, agentId);
    await runSideEffects(supabase, agentId);
    res.status(HTTP_OK).json({ version });
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
