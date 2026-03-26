import type { Request } from 'express';

import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTemplateAgentId, getTemplateVersion } from './templateHelpers.js';

export async function handleGetTemplateSnapshot(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getTemplateAgentId(req);
  const version = getTemplateVersion(req);

  if (agentId === undefined || version === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Missing agentId or version' });
    return;
  }

  try {
    const graph = await assembleTemplateSafeGraph(supabase, agentId, version);

    if (graph === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Version not found' });
      return;
    }

    res.status(HTTP_OK).json(graph);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
