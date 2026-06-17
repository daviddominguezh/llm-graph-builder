import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import { getAgentOrgId } from '../../db/queries/agentQueries.js';
import { createPerOrgRateLimiter } from '../../middleware/rateLimitPerOrg.js';
import { getAgentId } from '../routeHelpers.js';

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value && 'auth' in value;
}

function getSupabaseFromLocals(req: Request): SupabaseClient | null {
  const supabaseVal: unknown = req.res?.locals.supabase;
  if (!isSupabaseClient(supabaseVal)) return null;
  return supabaseVal;
}

async function resolveAgentOrgId(req: Request): Promise<string | null> {
  const agentId = getAgentId(req);
  if (agentId === undefined) return null;
  const supabase = getSupabaseFromLocals(req);
  if (supabase === null) return null;
  return await getAgentOrgId(supabase, agentId);
}

export function createAgentScopedRateLimiter(
  limit: number,
  windowMs: number
): ReturnType<typeof createPerOrgRateLimiter> {
  return createPerOrgRateLimiter({
    limit,
    windowMs,
    resolveOrgId: resolveAgentOrgId,
  });
}
