import type { Request } from 'express';

import { fetchCurrentAvatar, fetchCurrentSlug, updateOrgFields } from '../../db/queries/orgQueries.js';
import { findUniqueSlug, generateSlug, generateTenantSlug } from '../../db/queries/slugQueries.js';
import { findUniqueTenantSlug, mirrorDefaultTenantIdentity } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgId, parseStringField } from './orgHelpers.js';

function currentSlugMatchesBase(currentSlug: string, baseSlug: string): boolean {
  if (currentSlug === baseSlug) return true;
  const suffix = currentSlug.slice(baseSlug.length);
  return /^-\d+$/v.test(suffix);
}

// Mirrors the org's new name onto its default tenant (recomputing the tenant slug
// and preserving the org's current avatar so a rename never clobbers it). The org
// is the source of truth, so a mirror failure is logged, not surfaced.
async function mirrorRename(
  supabase: AuthenticatedLocals['supabase'],
  orgId: string,
  name: string
): Promise<void> {
  const base = generateTenantSlug(name);
  const tenantSlug = base === '' ? 'tenant' : await findUniqueTenantSlug(supabase, base);
  const avatarUrl = await fetchCurrentAvatar(supabase, orgId);
  const { error } = await mirrorDefaultTenantIdentity(supabase, orgId, { name, slug: tenantSlug, avatarUrl });
  if (error !== null) {
    process.stderr.write(`[sp1] default-tenant identity mirror failed for org ${orgId}: ${error}\n`);
  }
}

async function resolveSlugAndUpdate(
  supabase: AuthenticatedLocals['supabase'],
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  const baseSlug = generateSlug(name);
  if (baseSlug === '') return { result: null, error: 'Invalid organization name' };

  const currentSlug = await fetchCurrentSlug(supabase, orgId);
  const currentBase = currentSlug ?? '';
  const slugChanged = !currentSlugMatchesBase(currentBase, baseSlug);
  const slug = slugChanged ? await findUniqueSlug(supabase, baseSlug, 'organizations') : currentBase;

  const payload: Record<string, string> = { name };
  if (slugChanged) payload.slug = slug;

  const { error } = await updateOrgFields(supabase, orgId, payload);
  if (error !== null) return { result: null, error };
  await mirrorRename(supabase, orgId, name);
  return { result: slug, error: null };
}

export async function handleUpdateOrg(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgId(req);
  const name = parseStringField(req.body, 'name');

  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Name is required' });
    return;
  }

  try {
    const result = await resolveSlugAndUpdate(supabase, orgId, name);
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
