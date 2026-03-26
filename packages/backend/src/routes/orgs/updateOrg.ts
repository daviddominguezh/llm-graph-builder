import type { Request } from 'express';

import { fetchCurrentSlug, updateOrgFields } from '../../db/queries/orgQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
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
