import type { Request } from 'express';

import type { BrowseTemplateOptions } from '../../db/queries/templateQueries.js';

/* ------------------------------------------------------------------ */
/*  Param extractors                                                   */
/* ------------------------------------------------------------------ */

interface AgentIdParams {
  agentId?: string;
}

export function getTemplateAgentId(req: Request): string | undefined {
  const { agentId }: AgentIdParams = req.params;
  if (typeof agentId === 'string' && agentId !== '') return agentId;
  return undefined;
}

interface VersionParams {
  version?: string;
}

const MIN_VERSION = 1;

export function getTemplateVersion(req: Request): number | undefined {
  const { version }: VersionParams = req.params;
  if (typeof version !== 'string') return undefined;
  const parsed = Number(version);
  if (!Number.isFinite(parsed) || parsed < MIN_VERSION) return undefined;
  return Math.floor(parsed);
}

/* ------------------------------------------------------------------ */
/*  Query param parsers                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_BROWSE_LIMIT = 15;
const DEFAULT_BROWSE_OFFSET = 0;
const VALID_SORT_VALUES = new Set(['downloads', 'newest', 'updated']);

type SortValue = 'downloads' | 'newest' | 'updated';

function parseSortParam(raw: unknown): SortValue | undefined {
  if (typeof raw === 'string' && VALID_SORT_VALUES.has(raw)) return raw as SortValue;
  return undefined;
}

export function parseBrowseTemplateOptions(req: Request): BrowseTemplateOptions {
  const { query } = req;
  const search = typeof query.search === 'string' ? query.search : undefined;
  const category = typeof query.category === 'string' ? query.category : undefined;
  const sort = parseSortParam(query.sort);
  const limit = typeof query.limit === 'string' ? Number(query.limit) : DEFAULT_BROWSE_LIMIT;
  const offset = typeof query.offset === 'string' ? Number(query.offset) : DEFAULT_BROWSE_OFFSET;
  return { search, category, sort, limit, offset };
}
