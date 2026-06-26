import type { Request } from 'express';

import { startParsing } from '../../../rag/workerLoop.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

export async function handleConfirmUpload(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    await startParsing(supabase, fileId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
