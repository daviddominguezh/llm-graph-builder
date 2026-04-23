import type { Request } from 'express';

import { getExecutionsByTenant, getTenantSummary } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam, parseDashboardParams } from './dashboardHelpers.js';

const SUMMARY_FIRST_PAGE = 0;
const SUMMARY_PAGE_SIZE = 1;

function readTenantName(req: Request): string | undefined {
  const { tenantName } = req.query as { tenantName?: unknown };
  return typeof tenantName === 'string' && tenantName !== '' ? tenantName : undefined;
}

export async function handleGetTenantExecutionsBundle(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const orgId = getOrgIdParam(req);
  const tenantName = readTenantName(req);
  if (orgId === undefined || tenantName === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and tenantName are required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  const params = parseDashboardParams(req);
  try {
    const { rows } = await getTenantSummary(supabase, orgId, {
      page: SUMMARY_FIRST_PAGE,
      pageSize: SUMMARY_PAGE_SIZE,
      filters: { tenant_name: tenantName },
    });
    const [tenant] = rows;
    if (tenant === undefined) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Tenant not found' });
      return;
    }
    const executions = await getExecutionsByTenant(supabase, orgId, tenant.tenant_id, params);
    res.status(HTTP_OK).json({ tenant, executions });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
