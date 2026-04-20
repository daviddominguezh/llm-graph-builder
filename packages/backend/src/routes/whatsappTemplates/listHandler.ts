import type { Request } from 'express';

import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';

function getOrgId(req: Request): string | undefined {
  const orgIdParam: unknown = req.params.orgId;
  return typeof orgIdParam === 'string' ? orgIdParam : undefined;
}

/**
 * GET /orgs/:orgId/whatsapp-templates
 * Lists templates scoped to the org. RLS ensures the user is an org member.
 */
export async function handleListTemplates(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === undefined) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Missing orgId parameter' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  const result = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (result.error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: result.error.message });
    return;
  }

  res.status(HTTP_OK).json({ templates: result.data });
}

interface ConnectionListRow {
  id: string;
  agent_id: string;
  tenant_id: string;
  enabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toConnection(value: unknown): ConnectionListRow | null {
  if (!isRecord(value)) return null;
  const { id, agent_id: agentId, tenant_id: tenantId, enabled } = value;
  if (typeof id !== 'string' || typeof agentId !== 'string' || typeof tenantId !== 'string') {
    return null;
  }
  return { id, agent_id: agentId, tenant_id: tenantId, enabled: enabled === true };
}

function extractConnections(data: unknown): ConnectionListRow[] {
  if (!Array.isArray(data)) return [];
  const connections: ConnectionListRow[] = [];
  for (const raw of data) {
    const connection = toConnection(raw);
    if (connection !== null) connections.push(connection);
  }
  return connections;
}

/**
 * GET /orgs/:orgId/whatsapp-templates/connections
 * Returns WhatsApp channel_connections available in the org so the
 * create-template UI can pick which WABA the template belongs to.
 */
export async function handleListConnections(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === undefined) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Missing orgId parameter' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const result = await supabase
      .from('channel_connections')
      .select('id, agent_id, tenant_id, enabled')
      .eq('org_id', orgId)
      .eq('channel_type', 'whatsapp');

    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error.message });
      return;
    }

    res.status(HTTP_OK).json({ connections: extractConnections(result.data) });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
