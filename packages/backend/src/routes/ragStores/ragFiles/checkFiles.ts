import type { Request } from 'express';

import { getFilesDigestRows } from '../../../db/queries/ragFilesQueries.js';
import { computeFilesDigest } from '../../../rag/filesDigest.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseString } from './ragFileHelpers.js';

interface CheckResponse {
  changed: boolean;
  digest: string;
}

export async function handleCheckFiles(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const clientDigest = parseString(req.body, 'digest') ?? '';

  if (storeId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId are required' });
    return;
  }

  try {
    const { result, error } = await getFilesDigestRows(supabase, storeId, tenantId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    const digest = computeFilesDigest(result);
    const payload: CheckResponse = { changed: digest !== clientDigest, digest };
    res.status(HTTP_OK).json(payload);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
