import type { Request } from 'express';

import { getFilesDigestRows, listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { getTenantUsage } from '../../../db/queries/ragUsageQueries.js';
import { computeFilesDigest } from '../../../rag/filesDigest.js';
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
    const [filesRes, usageRes, digestRes] = await Promise.all([
      listFilesByStoreTenant(supabase, storeId, tenantId),
      getTenantUsage(supabase, storeId, tenantId),
      getFilesDigestRows(supabase, storeId, tenantId),
    ]);
    if (filesRes.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: filesRes.error });
      return;
    }
    const digest = computeFilesDigest(digestRes.result);
    res.status(HTTP_OK).json({ files: filesRes.result, usage: usageRes.result, digest });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
