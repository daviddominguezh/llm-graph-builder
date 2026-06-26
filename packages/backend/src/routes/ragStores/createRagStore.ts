import type { Request } from 'express';

import { createRagStore, findUniqueRagStoreSlug } from '../../db/queries/ragStoresQueries.js';
import { generateTenantSlug } from '../../db/queries/slugQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './ragStoreHelpers.js';

const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  return `store${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

export async function handleCreateRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }
  try {
    const generated = generateTenantSlug(name);
    const base = generated === '' ? fallbackSlug() : generated;
    const slug = await findUniqueRagStoreSlug(supabase, orgId, base);
    const { result, error } = await createRagStore(supabase, orgId, name, slug);
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create rag_store' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
