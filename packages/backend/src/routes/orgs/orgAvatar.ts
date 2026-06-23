import type { Request } from 'express';

import { updateOrgFields } from '../../db/queries/orgQueries.js';
import { removeOrgAvatar, uploadOrgAvatar } from '../../db/queries/orgStorageQueries.js';
import { mirrorDefaultTenantAvatar } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId } from './orgHelpers.js';

function getMulterFile(req: Request): Express.Multer.File | undefined {
  return (req as Request & { file?: Express.Multer.File }).file;
}

// Mirrors the org avatar onto its default tenant. Org is source of truth, so a
// mirror failure is logged, not surfaced.
async function mirrorAvatar(
  supabase: AuthenticatedLocals['supabase'],
  orgId: string,
  url: string | null
): Promise<void> {
  const { error } = await mirrorDefaultTenantAvatar(supabase, orgId, url);
  if (error !== null) {
    process.stderr.write(`[sp1] default-tenant avatar mirror failed for org ${orgId}: ${error}\n`);
  }
}

export async function handleUploadAvatar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }

  const file = getMulterFile(req);
  if (file === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'No file provided' });
    return;
  }

  try {
    const { result: url, error: uploadErr } = await uploadOrgAvatar(
      supabase,
      orgId,
      file.buffer,
      file.mimetype
    );
    if (uploadErr !== null || url === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: uploadErr ?? 'Upload failed' });
      return;
    }

    const { error } = await updateOrgFields(supabase, orgId, { avatar_url: url });
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    await mirrorAvatar(supabase, orgId, url);
    res.status(HTTP_OK).json({ url });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}

export async function handleRemoveAvatar(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }

  try {
    await removeOrgAvatar(supabase, orgId);
    const { error } = await updateOrgFields(supabase, orgId, { avatar_url: null });

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    await mirrorAvatar(supabase, orgId, null);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
