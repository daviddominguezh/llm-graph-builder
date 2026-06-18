import type { SupabaseClient } from '@supabase/supabase-js';

import { type AgentBindingRow, isAgentBindingRow, isTenantIdRow } from './types';

type DBClient = SupabaseClient;

/**
 * Look up the agent row needed to authorize the test and resolve the bound
 * store id. The query runs under the user's session, so RLS on `agents` (which
 * checks org membership) is the auth gate — no extra membership lookup needed.
 * Returns null when the row is missing or not visible.
 */
export async function fetchAgentBinding(
  supabase: DBClient,
  agentId: string
): Promise<AgentBindingRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('org_id, selected_kv_store_id, selected_rag_store_id')
    .eq('id', agentId)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return isAgentBindingRow(data) ? data : null;
}

/**
 * Fallback tenant resolution when the FE didn't pass an explicit tenantId.
 * Picks the org's earliest-created tenant — enough for in-editor testing.
 * TODO: thread real tenant id from editor context.
 */
export async function fetchDefaultTenantId(supabase: DBClient, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return isTenantIdRow(data) ? data.id : null;
}

/**
 * Verify the requested tenant belongs to the agent's org. RLS will already
 * block tenants the caller can't see, but this catches the cross-org case
 * where the user is a member of both orgs.
 */
export async function verifyTenantInOrg(
  supabase: DBClient,
  tenantId: string,
  orgId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error !== null || data === null) return false;
  return isTenantIdRow(data);
}
