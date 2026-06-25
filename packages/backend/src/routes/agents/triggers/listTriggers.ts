import type { Request } from 'express';

import { listTriggers } from '../../../db/queries/triggerQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../../routeHelpers.js';

interface TenantQuery {
  tenantId?: string | string[];
}

function getTenantId(req: Request): string | undefined {
  const { tenantId }: TenantQuery = req.query;
  return typeof tenantId === 'string' && tenantId !== '' ? tenantId : undefined;
}

export async function handleListTriggers(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const tenantId = getTenantId(req);
  if (agentId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and tenantId are required' });
    return;
  }

  try {
    const { result, error } = await listTriggers(supabase, agentId, tenantId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
