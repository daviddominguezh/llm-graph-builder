import type { Request } from 'express';

import { listVersions } from '../../db/queries/versionQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTemplateAgentId } from './templateHelpers.js';

export async function handleGetTemplateVersions(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getTemplateAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Missing agentId' });
    return;
  }

  try {
    const versions = await listVersions(supabase, agentId);
    res.status(HTTP_OK).json(versions);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
