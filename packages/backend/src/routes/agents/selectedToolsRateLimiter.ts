import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import { getAgentOrgId } from '../../db/queries/agentQueries.js';
import { createPerOrgRateLimiter } from '../../middleware/rateLimitPerOrg.js';
import { getAgentId } from '../routeHelpers.js';

const SELECTED_TOOLS_LIMIT = 30;
const SELECTED_TOOLS_WINDOW_MS = 60_000;

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value && 'auth' in value;
}

function getSupabaseFromLocals(req: Request): SupabaseClient | null {
  const supabaseVal: unknown = req.res?.locals.supabase;
  if (!isSupabaseClient(supabaseVal)) return null;
  return supabaseVal;
}

async function resolveSelectedToolsOrgId(req: Request): Promise<string | null> {
  const agentId = getAgentId(req);
  if (agentId === undefined) return null;
  const supabase = getSupabaseFromLocals(req);
  if (supabase === null) return null;
  return await getAgentOrgId(supabase, agentId);
}

export const selectedToolsLimiter = createPerOrgRateLimiter({
  limit: SELECTED_TOOLS_LIMIT,
  windowMs: SELECTED_TOOLS_WINDOW_MS,
  resolveOrgId: resolveSelectedToolsOrgId,
});
