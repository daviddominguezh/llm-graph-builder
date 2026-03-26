import type { Request } from 'express';

import { getAgentSummary } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam, parseDashboardParams } from './dashboardHelpers.js';

export async function handleGetAgentSummary(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getOrgIdParam(req);

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const params = parseDashboardParams(req);

  try {
    const result = await getAgentSummary(supabase, orgId, params);

    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
