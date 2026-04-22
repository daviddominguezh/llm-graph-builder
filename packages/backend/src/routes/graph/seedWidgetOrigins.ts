import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  On the agent's FIRST publish (version === 1), append the agent's  */
/*  standalone widget origin to every tenant's allowlist. Only runs   */
/*  once per agent, so if a user later removes the entry, subsequent  */
/*  publishes never put it back.                                      */
/* ------------------------------------------------------------------ */

const WIDGET_DOMAIN = process.env.WIDGET_DOMAIN ?? 'live.openflow.build';

interface AgentOrgRow {
  slug: string;
  org_id: string;
}

interface TenantOriginsRow {
  id: string;
  slug: string;
  web_channel_allowed_origins: string[];
}

function isAgentOrgRow(value: unknown): value is AgentOrgRow {
  return typeof value === 'object' && value !== null && 'slug' in value && 'org_id' in value;
}

function isTenantOriginsRow(value: unknown): value is TenantOriginsRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'slug' in value && 'web_channel_allowed_origins' in value;
}

function buildWidgetOrigin(tenantSlug: string, agentSlug: string): string {
  return `https://${tenantSlug}-${agentSlug}.${WIDGET_DOMAIN}`;
}

async function fetchAgentOrg(supabase: SupabaseClient, agentId: string): Promise<AgentOrgRow | null> {
  const { data, error } = await supabase.from('agents').select('slug, org_id').eq('id', agentId).single();
  if (error !== null) return null;
  return isAgentOrgRow(data) ? data : null;
}

async function fetchTenants(supabase: SupabaseClient, orgId: string): Promise<TenantOriginsRow[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, web_channel_allowed_origins')
    .eq('org_id', orgId);
  if (error !== null) return [];
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return rows.filter(isTenantOriginsRow);
}

async function appendOrigin(
  supabase: SupabaseClient,
  tenant: TenantOriginsRow,
  origin: string
): Promise<boolean> {
  if (tenant.web_channel_allowed_origins.includes(origin)) return false;
  const next = [...tenant.web_channel_allowed_origins, origin];
  const { error } = await supabase
    .from('tenants')
    .update({ web_channel_allowed_origins: next, updated_at: new Date().toISOString() })
    .eq('id', tenant.id);
  if (error !== null) {
    throw new Error(`tenant ${tenant.id}: ${error.message}`);
  }
  return true;
}

function logSeedResult(agentId: string, updated: number, skipped: number): void {
  process.stderr.write(
    `[seedWidgetOrigins] agent=${agentId} updated=${String(updated)} skipped=${String(skipped)}\n`
  );
}

export async function seedWidgetOriginsForAgent(supabase: SupabaseClient, agentId: string): Promise<void> {
  const agent = await fetchAgentOrg(supabase, agentId);
  if (agent === null) return;
  const tenants = await fetchTenants(supabase, agent.org_id);
  const results = await Promise.all(
    tenants.map(async (tenant) => {
      const origin = buildWidgetOrigin(tenant.slug, agent.slug);
      return await appendOrigin(supabase, tenant, origin);
    })
  );
  const { length: totalCount } = results;
  const { length: updated } = results.filter(Boolean);
  logSeedResult(agentId, updated, totalCount - updated);
}
