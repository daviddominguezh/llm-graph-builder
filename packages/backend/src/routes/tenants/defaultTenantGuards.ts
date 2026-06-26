import type { SupabaseClient } from '@supabase/supabase-js';

import { getTenantById } from '../../db/queries/tenantQueries.js';
import { HTTP_FORBIDDEN } from '../routeHelpers.js';

// Minimal slice of the Express response this guard needs. An Express
// `AuthenticatedResponse` satisfies it structurally, so route handlers pass
// their real `res` while unit tests pass a plain stub — no casts required.
interface ForbidResponder {
  status: (code: number) => { json: (body: unknown) => unknown };
}

/**
 * Rejects mutations targeting an org's default tenant. Looks the tenant up and,
 * when it is the default, responds `403 { error: code }` and returns `true`
 * (signalling the caller to return early). Returns `false` otherwise.
 */
export async function assertNotDefaultTenant(
  supabase: SupabaseClient,
  tenantId: string,
  res: ForbidResponder,
  code: string
): Promise<boolean> {
  const { result } = await getTenantById(supabase, tenantId);
  if (result?.is_default === true) {
    res.status(HTTP_FORBIDDEN).json({ error: code });
    return true;
  }
  return false;
}
