import type { Request } from 'express';

import { getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

export async function handleGetFile(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    const { result, error } = await getRagFileById(supabase, fileId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    if (result === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'not found' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
