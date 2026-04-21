import type { Request } from 'express';

import { getTenantBySlug } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';

function getParams(req: Request): { orgId?: string; slug?: string } {
  const orgIdParam: unknown = req.params.orgId;
  const slugParam: unknown = req.params.slug;
  return {
    orgId: typeof orgIdParam === 'string' ? orgIdParam : undefined,
    slug: typeof slugParam === 'string' ? slugParam : undefined,
  };
}

export async function handleGetTenantBySlug(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, slug } = getParams(req);
  if (orgId === undefined || slug === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and slug are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const { result, error } = await getTenantBySlug(supabase, orgId, slug);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    if (result === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Tenant not found' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
