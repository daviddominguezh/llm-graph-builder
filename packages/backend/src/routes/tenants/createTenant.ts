import type { Request } from 'express';

import { generateSlug } from '../../db/queries/slugQueries.js';
import { createTenant, findUniqueTenantSlug } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './tenantHelpers.js';

const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  return `tenant-${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

export async function handleCreateTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');

  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  try {
    const rawSlug = generateSlug(name);
    const baseSlug = rawSlug === '' ? fallbackSlug() : rawSlug;
    const slug = await findUniqueTenantSlug(supabase, orgId, baseSlug);

    const { result, error } = await createTenant(supabase, orgId, name, slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create tenant' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
