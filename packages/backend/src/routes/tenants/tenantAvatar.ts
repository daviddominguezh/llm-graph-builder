import type { Request } from 'express';

import { updateTenantFields } from '../../db/queries/tenantQueries.js';
import { removeTenantAvatar, uploadTenantAvatar } from '../../db/queries/tenantStorageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTenantIdParam } from './tenantHelpers.js';

function getMulterFile(req: Request): Express.Multer.File | undefined {
  return (req as Request & { file?: Express.Multer.File }).file;
}

export async function handleUploadTenantAvatar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const tenantId = getTenantIdParam(req);

  if (tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Tenant ID is required' });
    return;
  }

  const file = getMulterFile(req);
  if (file === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'No file provided' });
    return;
  }

  try {
    const { result: url, error: uploadErr } = await uploadTenantAvatar(
      supabase,
      tenantId,
      file.buffer,
      file.mimetype
    );
    if (uploadErr !== null || url === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: uploadErr ?? 'Upload failed' });
      return;
    }

    const { error } = await updateTenantFields(supabase, tenantId, { avatar_url: url });
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ url });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

export async function handleRemoveTenantAvatar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const tenantId = getTenantIdParam(req);

  if (tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Tenant ID is required' });
    return;
  }

  try {
    await removeTenantAvatar(supabase, tenantId);
    const { error } = await updateTenantFields(supabase, tenantId, { avatar_url: null });

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
