import type { Request } from 'express';

import type { DashboardParams } from '../../db/queries/dashboardQueries.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MIN_PAGE = 0;
const MIN_PAGE_SIZE = 1;

/* ------------------------------------------------------------------ */
/*  Param extraction                                                   */
/* ------------------------------------------------------------------ */

interface OrgIdParams {
  orgId?: string;
}

interface AgentIdParams {
  agentId?: string;
}

interface SessionIdParams {
  sessionId?: string;
}

interface TenantIdParams {
  tenantId?: string;
}

interface ExecutionIdParams {
  executionId?: string;
}

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getAgentIdParam(req: Request): string | undefined {
  const { agentId }: AgentIdParams = req.params;
  if (typeof agentId === 'string' && agentId !== '') return agentId;
  return undefined;
}

export function getSessionIdParam(req: Request): string | undefined {
  const { sessionId }: SessionIdParams = req.params;
  if (typeof sessionId === 'string' && sessionId !== '') return sessionId;
  return undefined;
}

export function getTenantIdParam(req: Request): string | undefined {
  const { tenantId }: TenantIdParams = req.params;
  if (typeof tenantId === 'string' && tenantId !== '') return tenantId;
  return undefined;
}

export function getExecutionIdParam(req: Request): string | undefined {
  const { executionId }: ExecutionIdParams = req.params;
  if (typeof executionId === 'string' && executionId !== '') return executionId;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Query string parsing                                               */
/* ------------------------------------------------------------------ */

function clampNumber(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function parseIntQuery(val: unknown, fallback: number): number {
  if (typeof val !== 'string') return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseSortDirection(val: unknown): 'asc' | 'desc' {
  if (val === 'asc') return 'asc';
  return 'desc';
}

function parseFilters(req: Request): Record<string, string> | undefined {
  const filters: Record<string, string> = {};
  const filterKeys = ['tenant_id', 'user_id', 'channel', 'model', 'status', 'session_id', 'version'];
  let hasFilters = false;

  for (const key of filterKeys) {
    const val: unknown = req.query[key];
    if (typeof val === 'string' && val !== '') {
      filters[key] = val;
      hasFilters = true;
    }
  }

  return hasFilters ? filters : undefined;
}

export function parseDashboardParams(req: Request): DashboardParams {
  const { query } = req;
  const page = clampNumber(parseIntQuery(query.page, DEFAULT_PAGE), MIN_PAGE, Number.MAX_SAFE_INTEGER);

  const pageSize = clampNumber(
    parseIntQuery(query.pageSize, DEFAULT_PAGE_SIZE),
    MIN_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  const sortKey = typeof query.sortKey === 'string' ? query.sortKey : undefined;

  const sortDirection = parseSortDirection(query.sortDirection);
  const filters = parseFilters(req);

  const search = typeof query.search === 'string' && query.search !== '' ? query.search : undefined;

  return { page, pageSize, sortKey, sortDirection, filters, search };
}
