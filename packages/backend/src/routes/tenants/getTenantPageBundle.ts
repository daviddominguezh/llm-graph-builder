import type { Request } from 'express';

import { getUserRoleInOrg } from '../../db/queries/orgQueries.js';
import { getTenantBySlug } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { type ConnectionListRow, extractConnections } from '../whatsappTemplates/listHandler.js';

interface BundleFetchResults {
  role: string | null;
  templates: unknown[];
  connections: ConnectionListRow[];
}

async function fetchTemplates(
  supabase: AuthenticatedLocals['supabase'],
  tenantId: string
): Promise<unknown[]> {
  const result = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return Array.isArray(result.data) ? result.data : [];
}

async function fetchConnections(
  supabase: AuthenticatedLocals['supabase'],
  tenantId: string
): Promise<ConnectionListRow[]> {
  const result = await supabase
    .from('channel_connections')
    .select('id, agent_id, enabled, whatsapp_credentials(phone_number, waba_id)')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'whatsapp');
  return extractConnections(result.data);
}

async function fetchBundleParts(
  supabase: AuthenticatedLocals['supabase'],
  userId: string,
  orgId: string,
  tenantId: string
): Promise<BundleFetchResults> {
  const [role, templates, connections] = await Promise.all([
    getUserRoleInOrg(supabase, orgId, userId),
    fetchTemplates(supabase, tenantId),
    fetchConnections(supabase, tenantId),
  ]);
  return { role, templates, connections };
}

function getParams(req: Request): { orgId?: string; slug?: string } {
  const orgIdParam: unknown = req.params.orgId;
  const slugParam: unknown = req.params.slug;
  return {
    orgId: typeof orgIdParam === 'string' ? orgIdParam : undefined,
    slug: typeof slugParam === 'string' ? slugParam : undefined,
  };
}

export async function handleGetTenantPageBundle(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, slug } = getParams(req);
  if (orgId === undefined || slug === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and slug are required' });
    return;
  }
  const { supabase, userId }: AuthenticatedLocals = res.locals;
  try {
    const { result: tenant, error } = await getTenantBySlug(supabase, orgId, slug);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    if (tenant === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Tenant not found' });
      return;
    }
    const parts = await fetchBundleParts(supabase, userId, orgId, tenant.id);
    res.status(HTTP_OK).json({ tenant, ...parts });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
