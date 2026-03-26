import type { Request } from 'express';

import { deleteOrg } from '../../db/queries/orgQueries.js';
import { removeOrgAvatar } from '../../db/queries/orgStorageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId } from './orgHelpers.js';

export async function handleDeleteOrg(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }

  try {
    await removeOrgAvatar(supabase, orgId);
    const { error } = await deleteOrg(supabase, orgId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
