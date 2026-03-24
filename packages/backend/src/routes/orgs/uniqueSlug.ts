import type { Request } from 'express';

import { findUniqueSlug } from '../../db/queries/slugQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './orgHelpers.js';

type SlugTable = 'agents' | 'organizations';

const VALID_TABLES: ReadonlySet<string> = new Set(['agents', 'organizations']);

function isSlugTable(val: string): val is SlugTable {
  return VALID_TABLES.has(val);
}

export async function handleUniqueSlug(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const baseSlug = parseStringField(req.body, 'baseSlug');
  const table = parseStringField(req.body, 'table');

  if (baseSlug === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'baseSlug is required' });
    return;
  }

  if (table === undefined || !isSlugTable(table)) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'table must be "agents" or "organizations"' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, table);
    res.status(HTTP_OK).json({ slug });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
