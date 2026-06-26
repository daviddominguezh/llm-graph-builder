import type { Request } from 'express';

import { type RagFileRow, deleteFile, getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import { deleteObject, deletePrefix } from '../../../rag/gcs.js';
import { derivePdfObjectPath, isImageMime } from '../../../rag/imagePdf.js';
import { invalidateImagePresence } from '../../../rag/imagePresenceCache.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

async function cleanupGcs(file: RagFileRow): Promise<void> {
  await deleteObject(file.gcs_object);
  if (isImageMime(file.mime_type)) {
    await deleteObject(derivePdfObjectPath(file.gcs_object));
  }
  if (file.parsed_uri !== null && file.parsed_uri !== '') {
    await deletePrefix(file.parsed_uri);
  }
}

export async function handleDeleteFile(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    const { result } = await getRagFileById(supabase, fileId);
    if (result !== null) await cleanupGcs(result);
    const { error } = await deleteFile(supabase, fileId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    if (result !== null && isImageMime(result.mime_type)) {
      await invalidateImagePresence(result.rag_store_id, result.tenant_id);
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
