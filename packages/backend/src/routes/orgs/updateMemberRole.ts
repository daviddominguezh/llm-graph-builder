import type { Request } from 'express';

import { updateOrgMemberRole } from '../../db/queries/memberQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId, parseStringField } from './orgHelpers.js';

function getUserIdParam(req: Request): string | undefined {
  const { userId } = req.params as { userId?: string };
  if (typeof userId === 'string' && userId !== '') return userId;
  return undefined;
}

export async function handleUpdateMemberRole(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);
  const userId = getUserIdParam(req);
  const role = parseStringField(req.body, 'role');

  if (orgId === undefined || userId === undefined || role === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID, user ID, and role are required' });
    return;
  }

  try {
    const { error } = await updateOrgMemberRole(supabase, orgId, userId, role);
    if (error !== null) {
      res.status(HTTP_BAD_REQUEST).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
