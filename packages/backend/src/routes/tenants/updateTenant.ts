import type { Request } from 'express';

import { updateTenant } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTenantIdParam, parseStringField } from './tenantHelpers.js';

export async function handleUpdateTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const tenantId = getTenantIdParam(req);
  const name = parseStringField(req.body, 'name');

  if (tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Tenant ID is required' });
    return;
  }

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'name is required' });
    return;
  }

  try {
    const { result, error } = await updateTenant(supabase, tenantId, name);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to update tenant' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
