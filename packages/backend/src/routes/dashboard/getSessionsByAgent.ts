import type { Request } from 'express';

import { getSessionsByAgent } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getAgentIdParam, getOrgIdParam, parseDashboardParams } from './dashboardHelpers.js';

export async function handleGetSessionsByAgent(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getOrgIdParam(req);
  const agentId = getAgentIdParam(req);

  if (orgId === undefined || agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and agentId are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const params = parseDashboardParams(req);

  try {
    const result = await getSessionsByAgent(supabase, orgId, agentId, params);

    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
