import express from 'express';
import type { Request } from 'express';

import { getOrgMembers } from '../../db/queries/memberQueries.js';
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

    const { result, error } = await getOrgMembers(getSupabase(res), orgId);
    if (error !== null) {
      res.status(HTTP_BAD_REQUEST).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ collaborators: result });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const collaboratorsRouter = express.Router({ mergeParams: true });
collaboratorsRouter.get('/', handleGetCollaborators);
