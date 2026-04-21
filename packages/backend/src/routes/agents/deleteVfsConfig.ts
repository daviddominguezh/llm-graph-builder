import type { Request } from 'express';

import { deleteVfsConfig } from '../../db/queries/vfsConfigQueries.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR, extractErrorMessage, getAgentId } from '../routeHelpers.js';

const HTTP_NO_CONTENT = 204;

interface OrgParam {
  orgId?: string | string[];
}

function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgParam = req.params;
  return typeof orgId === 'string' ? orgId : undefined;
}

export async function handleDeleteVfsConfig(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const orgId = getOrgIdParam(req);

  if (agentId === undefined || orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and org ID are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    await deleteVfsConfig(supabase, agentId, orgId);
    res.status(HTTP_NO_CONTENT).send();
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
