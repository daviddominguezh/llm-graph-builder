import type { Request } from 'express';

import { addOrgMemberByEmail } from '../../db/queries/memberQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId, parseStringField } from './orgHelpers.js';

export async function handleAddMember(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);
  const email = parseStringField(req.body, 'email');
  const role = parseStringField(req.body, 'role');

  if (orgId === undefined || email === undefined || role === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID, email, and role are required' });
    return;
  }

  try {
    const { result, error } = await addOrgMemberByEmail(supabase, orgId, email, role);
    if (error !== null) {
      res.status(HTTP_BAD_REQUEST).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ user_id: result });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
