import express from 'express';
import type { Request } from 'express';

import type { OrgMemberRow } from '../../db/queries/memberQueries.js';
import { getOrgMembersServiceRole } from '../../db/queries/memberQueries.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

/**
 * Shape returned to the web client. Matches the `Collaborator` type in
 * packages/web/app/types/projectInnerSettings.ts so the dropdown filter in
 * ChatsSearch (which drops rows whose `status` isn't 'active'/'pending') sees
 * the row. Members of `org_members` are always active; pending invitations
 * live in a separate table and are not returned by this endpoint.
 */
interface CollaboratorResponse {
  name: string;
  role: string;
  email: string;
  status: 'active';
}

function toCollaboratorResponse(row: OrgMemberRow): CollaboratorResponse {
  return {
    name: row.full_name,
    role: row.role,
    email: row.email,
    status: 'active',
  };
}

async function lookupOrgId(req: Request, res: MessagingResponse): Promise<string | null> {
  const supabase = getSupabase(res);
  const tenantId = getRequiredParam(req, 'tenantId');

  const result: { data: unknown; error: { message: string } | null } = await supabase
    .from('tenants')
    .select('org_id')
    .eq('id', tenantId)
    .single();

  if (result.error !== null || result.data === null) return null;

  const row: unknown = result.data;
  if (typeof row !== 'object' || row === null || !('org_id' in row)) return null;
  const orgId: unknown = (row as Record<string, unknown>).org_id;
  return typeof orgId === 'string' ? orgId : null;
}

async function handleGetCollaborators(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const orgId = await lookupOrgId(req, res);
    if (orgId === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Tenant not found' });
      return;
    }

    // Messaging route uses a service-role Supabase client (see ensureMessagingAuth).
    // `auth.uid()` is NULL there, so the RPC's `is_org_member(p_org_id)` gate would
    // silently return []. Use the service-role variant which skips that gate.
    const { result, error } = await getOrgMembersServiceRole(getSupabase(res), orgId);
    if (error !== null) {
      res.status(HTTP_BAD_REQUEST).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ collaborators: result.map(toCollaboratorResponse) });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const collaboratorsRouter = express.Router({ mergeParams: true });
collaboratorsRouter.get('/', handleGetCollaborators);
