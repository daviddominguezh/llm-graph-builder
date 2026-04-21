import type { Request } from 'express';

import { getExecutionsByTenant } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam, getTenantIdParam, parseDashboardParams } from './dashboardHelpers.js';

export async function handleGetExecutionsByTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getOrgIdParam(req);
  const tenantId = getTenantIdParam(req);

  if (orgId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and tenantId are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const params = parseDashboardParams(req);

  try {
    const result = await getExecutionsByTenant(supabase, orgId, tenantId, params);

    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
