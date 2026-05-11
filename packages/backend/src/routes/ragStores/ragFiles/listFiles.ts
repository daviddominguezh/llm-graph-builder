import type { Request } from 'express';

import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { getTenantUsage } from '../../../db/queries/ragUsageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam } from './ragFileHelpers.js';

export async function handleListFiles(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
  if (storeId === undefined || tenantId === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId required' });
    return;
  }
  try {
    const [filesRes, usageRes] = await Promise.all([
      listFilesByStoreTenant(supabase, storeId, tenantId),
      getTenantUsage(supabase, storeId, tenantId),
    ]);
    if (filesRes.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: filesRes.error });
      return;
    }
    res.status(HTTP_OK).json({ files: filesRes.result, usage: usageRes.result });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
