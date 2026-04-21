import { isValidTenantSlug } from '@openflow/shared-validation';
import type { Request } from 'express';

import { generateTenantSlug } from '../../db/queries/slugQueries.js';
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

const HTTP_CONFLICT = 409;
const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  // No hyphens allowed in tenant slugs; emit a bare alphanumeric id.
  return `tenant${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

type SlugOutcome = { ok: true; slug: string } | { ok: false; status: number; error: string };

async function resolveSlug(
  supabase: AuthenticatedLocals['supabase'],
  name: string,
  explicit: string | undefined
): Promise<SlugOutcome> {
  if (explicit !== undefined) {
    if (!isValidTenantSlug(explicit)) {
      return { ok: false, status: HTTP_BAD_REQUEST, error: 'Invalid slug' };
    }
    const resolved = await findUniqueTenantSlug(supabase, explicit);
    if (resolved !== explicit) {
      return { ok: false, status: HTTP_CONFLICT, error: 'slug_taken' };
    }
    return { ok: true, slug: explicit };
  }
  const generated = generateTenantSlug(name);
  const base = generated === '' ? fallbackSlug() : generated;
  const unique = await findUniqueTenantSlug(supabase, base);
  if (!isValidTenantSlug(unique)) {
    return { ok: false, status: HTTP_INTERNAL_ERROR, error: 'Generated slug is invalid' };
  }
  return { ok: true, slug: unique };
}

export async function handleCreateTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const explicitSlug = parseStringField(req.body, 'slug');

  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  try {
    const slugResult = await resolveSlug(supabase, name, explicitSlug);
    if (!slugResult.ok) {
      res.status(slugResult.status).json({ error: slugResult.error });
      return;
    }

    const { result, error } = await createTenant(supabase, orgId, name, slugResult.slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create tenant' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
