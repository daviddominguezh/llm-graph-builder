import type { Request } from 'express';

import { checkBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { generateSlug } from '../../db/queries/slugQueries.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';

type SlugTable = 'agents' | 'organizations';

const VALID_TABLES: ReadonlySet<string> = new Set(['agents', 'organizations']);

function isSlugTable(val: string): val is SlugTable {
  return VALID_TABLES.has(val);
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export async function handleCheckAvailability(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const name = parseStringField(req.body, 'name');
  const table = parseStringField(req.body, 'table');

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'name is required' });
    return;
  }

  if (table === undefined || !isSlugTable(table)) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'table must be "agents" or "organizations"' });
    return;
  }

  const slug = generateSlug(name);

  if (slug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid name' });
    return;
  }

  try {
    const bitmask = buildBitmask(slug);
    const mightExist = await checkBloomFilter(supabase, bitmask, table);
    res.status(HTTP_OK).json({ slug, available: !mightExist });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
