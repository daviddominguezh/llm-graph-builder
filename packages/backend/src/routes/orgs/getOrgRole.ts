import type { Request } from 'express';

import { getUserRoleInOrg } from '../../db/queries/orgQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId } from './orgHelpers.js';

export async function handleGetOrgRole(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase, userId }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }

  try {
    const role = await getUserRoleInOrg(supabase, orgId, userId);
    res.status(HTTP_OK).json({ role });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
