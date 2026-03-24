import type { Request } from 'express';

import { updateLibraryImageUrl } from '../../db/queries/mcpLibraryQueries.js';
import { removeMcpImage, uploadMcpImage } from '../../db/queries/mcpLibraryStorageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getEntryId } from './mcpLibraryHelpers.js';

interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

function isRequestWithFile(req: Request): req is RequestWithFile {
  return 'file' in req;
}

function getMulterFile(req: Request): Express.Multer.File | undefined {
  if (!isRequestWithFile(req)) return undefined;
  return req.file;
}

export async function handleUploadMcpImage(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const entryId = getEntryId(req);

  if (entryId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Entry ID is required' });
    return;
  }

  const file = getMulterFile(req);
  if (file === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'No file provided' });
    return;
  }

  try {
    const { result: url, error: uploadErr } = await uploadMcpImage(
      supabase,
      entryId,
      file.buffer,
      file.mimetype
    );

    if (uploadErr !== null || url === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: uploadErr ?? 'Upload failed' });
      return;
    }

    const { error } = await updateLibraryImageUrl(supabase, entryId, url);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ url });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

export async function handleRemoveMcpImage(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const entryId = getEntryId(req);

  if (entryId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Entry ID is required' });
    return;
  }

  try {
    await removeMcpImage(supabase, entryId);
    const { error } = await updateLibraryImageUrl(supabase, entryId, '');
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
