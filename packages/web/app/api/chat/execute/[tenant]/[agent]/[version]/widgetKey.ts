import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Server-side resolution of the per-agent widget execution key.      */
/*  Called only from the Next.js chat-execute proxy; never client-     */
/*  readable.                                                           */
/* ------------------------------------------------------------------ */

export interface ResolvedTarget {
  tenantId: string;
  widgetToken: string;
}

type DBClient = SupabaseClient;

interface TenantIdRow {
  id: string;
  org_id: string;
}

interface AgentKeyRow {
  widget_execution_key_id: string | null;
}

function isTenantIdRow(value: unknown): value is TenantIdRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'org_id' in value;
}

function isAgentKeyRow(value: unknown): value is AgentKeyRow {
  return typeof value === 'object' && value !== null && 'widget_execution_key_id' in value;
}

async function fetchTenant(supabase: DBClient, slug: string): Promise<TenantIdRow | null> {
  const { data, error } = await supabase.from('tenants').select('id, org_id').eq('slug', slug).maybeSingle();
  if (error !== null || data === null) return null;
  return isTenantIdRow(data) ? data : null;
}

async function fetchAgent(supabase: DBClient, orgId: string, agentSlug: string): Promise<AgentKeyRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('widget_execution_key_id')
    .eq('org_id', orgId)
    .eq('slug', agentSlug)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return isAgentKeyRow(data) ? data : null;
}

async function fetchToken(supabase: DBClient, keyId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_execution_key_value', { p_key_id: keyId });
  if (error !== null) return null;
  return typeof data === 'string' ? data : null;
}

export async function resolveWidgetTarget(
  supabase: DBClient,
  tenantSlug: string,
  agentSlug: string
): Promise<ResolvedTarget | null> {
  const tenant = await fetchTenant(supabase, tenantSlug);
  if (tenant === null) return null;
  const agent = await fetchAgent(supabase, tenant.org_id, agentSlug);
  if (agent === null || agent.widget_execution_key_id === null) return null;
  const token = await fetchToken(supabase, agent.widget_execution_key_id);
  if (token === null) return null;
  return { tenantId: tenant.id, widgetToken: token };
}
