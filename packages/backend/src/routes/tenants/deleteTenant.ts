import type { Request } from 'express';

import { deleteTenant } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTenantIdParam } from './tenantHelpers.js';

export async function handleDeleteTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const tenantId = getTenantIdParam(req);

  if (tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Tenant ID is required' });
    return;
  }

  try {
    const { error } = await deleteTenant(supabase, tenantId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
