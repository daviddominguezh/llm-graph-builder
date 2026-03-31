import type { Request } from 'express';

import { cancelOrgInvitation } from '../../db/queries/memberQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId } from './orgHelpers.js';

function getInvitationId(req: Request): string | undefined {
  const { invitationId } = req.params as { invitationId?: string };
  if (typeof invitationId === 'string' && invitationId !== '') return invitationId;
  return undefined;
}

export async function handleCancelInvitation(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);
  const invitationId = getInvitationId(req);

  if (orgId === undefined || invitationId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID and invitation ID are required' });
    return;
  }

  try {
    const { error } = await cancelOrgInvitation(supabase, orgId, invitationId);
    if (error !== null) {
      res.status(HTTP_BAD_REQUEST).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
