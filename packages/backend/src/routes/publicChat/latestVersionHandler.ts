import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Public unauthenticated endpoint:                                    */
/*    GET /api/chat/latest-version/:tenantSlug/:agentSlug              */
/*                                                                      */
/*  Resolves (tenantSlug, agentSlug) → { version, allowedOrigins,       */
/*  webChannelEnabled }. Used by the widget at boot time to gate        */
/*  rendering and by the Next.js proxy to discover the current version.*/
/* ------------------------------------------------------------------ */

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

interface LatestVersionParams {
  tenantSlug?: string;
  agentSlug?: string;
}

interface TenantRow {
  id: string;
  org_id: string;
  name: string;
  avatar_url: string | null;
  web_channel_enabled: boolean;
  web_channel_allowed_origins: string[];
}

interface AgentVersionRow {
  id: string;
  name: string;
  current_version: number;
}

function isTenantRow(value: unknown): value is TenantRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    'org_id' in value &&
    'name' in value &&
    'avatar_url' in value &&
    'web_channel_enabled' in value &&
    'web_channel_allowed_origins' in value
  );
}

function isAgentVersionRow(value: unknown): value is AgentVersionRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'name' in value && 'current_version' in value;
}

async function fetchTenant(supabase: SupabaseClient, slug: string): Promise<TenantRow | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, org_id, name, avatar_url, web_channel_enabled, web_channel_allowed_origins')
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return isTenantRow(data) ? data : null;
}

async function fetchAgent(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<AgentVersionRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, current_version')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return isAgentVersionRow(data) ? data : null;
}

function parseParams(req: Request): { tenantSlug: string; agentSlug: string } | null {
  const { tenantSlug, agentSlug }: LatestVersionParams = req.params;
  if (typeof tenantSlug !== 'string' || typeof agentSlug !== 'string') return null;
  if (!isValidTenantSlug(tenantSlug) || !isValidAgentSlug(agentSlug)) return null;
  return { tenantSlug, agentSlug };
}

export async function handleLatestVersion(req: Request, res: Response): Promise<void> {
  const params = parseParams(req);
  if (params === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_slug' });
    return;
  }

  try {
    const supabase = createServiceClient();
    const tenant = await fetchTenant(supabase, params.tenantSlug);
    if (tenant === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'tenant_not_found' });
      return;
    }
    const agent = await fetchAgent(supabase, tenant.org_id, params.agentSlug);
    if (agent === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'agent_not_found' });
      return;
    }
    res.status(HTTP_OK).json({
      version: agent.current_version,
      allowedOrigins: tenant.web_channel_allowed_origins,
      webChannelEnabled: tenant.web_channel_enabled,
      tenant: { name: tenant.name, avatarUrl: tenant.avatar_url },
      agent: { name: agent.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
