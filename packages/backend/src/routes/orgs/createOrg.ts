import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import { createApiKey } from '../../db/queries/apiKeyQueries.js';
import { updateBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { insertOrg } from '../../db/queries/orgQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import { OPENFLOW_KEY_NAME, createOpenRouterKey } from '../../openrouter/managementKeys.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './orgHelpers.js';

async function provisionOpenRouterKey(
  supabase: SupabaseClient,
  orgId: string,
  orgName: string
): Promise<void> {
  try {
    const orKey = await createOpenRouterKey(orgName);
    if (orKey === null) return;

    const { error } = await createApiKey(supabase, orgId, OPENFLOW_KEY_NAME, orKey.key);
    if (error !== null) {
      process.stderr.write(`[openrouter] Failed to store key for org ${orgId}: ${error}\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`[openrouter] Key provisioning failed for org ${orgId}: ${msg}\n`);
  }
}

export async function handleCreateOrg(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const name = parseStringField(req.body, 'name');

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Name is required' });
    return;
  }

  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid organization name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
    const { result, error } = await insertOrg(supabase, name, slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create organization' });
      return;
    }

    await updateBloomFilter(supabase, buildBitmask(slug), 'organizations');
    await provisionOpenRouterKey(supabase, result.id, name);
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
