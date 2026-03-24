import type { Request } from 'express';

import type { BrowseOptions, PublishInput } from '../../db/queries/mcpLibraryQueries.js';

/* ------------------------------------------------------------------ */
/*  Param extractors                                                   */
/* ------------------------------------------------------------------ */

interface EntryIdParams {
  entryId?: string;
}

export function getEntryId(req: Request): string | undefined {
  const { entryId }: EntryIdParams = req.params;
  if (typeof entryId === 'string' && entryId !== '') return entryId;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Query param parsers                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_BROWSE_LIMIT = 30;
const DEFAULT_BROWSE_OFFSET = 0;

export function parseBrowseOptions(req: Request): BrowseOptions {
  const { query } = req;
  const q = typeof query.q === 'string' ? query.q : undefined;
  const category = typeof query.category === 'string' ? query.category : undefined;
  const limit = typeof query.limit === 'string' ? Number(query.limit) : DEFAULT_BROWSE_LIMIT;
  const offset = typeof query.offset === 'string' ? Number(query.offset) : DEFAULT_BROWSE_OFFSET;
  return { query: q, category, limit, offset };
}

/* ------------------------------------------------------------------ */
/*  Body parsers with type guards                                      */
/* ------------------------------------------------------------------ */

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isStringRecord(val: unknown): val is Record<string, unknown> {
  return isRecord(val);
}

function isVariablesArray(val: unknown): val is Array<{ name: string; description?: string }> {
  return Array.isArray(val);
}

export function parsePublishInput(body: unknown): PublishInput | undefined {
  if (!isRecord(body)) return undefined;
  const {
    org_id: orgId,
    name,
    description,
    category,
    transport_type: transportType,
    transport_config: transportConfig,
    variables,
  } = body;
  if (!isString(orgId) || !isString(name)) return undefined;
  if (!isString(description) || !isString(category)) return undefined;
  if (!isString(transportType)) return undefined;
  if (!isStringRecord(transportConfig)) return undefined;
  if (!isVariablesArray(variables)) return undefined;

  return {
    org_id: orgId,
    name,
    description,
    category,
    transport_type: transportType,
    transport_config: transportConfig,
    variables,
  };
}
