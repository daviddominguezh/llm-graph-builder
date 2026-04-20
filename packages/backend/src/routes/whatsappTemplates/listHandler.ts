import type { Request } from 'express';

import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';

function getTenantId(req: Request): string | undefined {
  const tenantIdParam: unknown = req.params.tenantId;
  return typeof tenantIdParam === 'string' ? tenantIdParam : undefined;
}

/**
 * GET /tenants/:tenantId/whatsapp-templates
 * Lists templates scoped to the tenant. RLS enforces org membership.
 */
export async function handleListTemplates(req: Request, res: AuthenticatedResponse): Promise<void> {
  const tenantId = getTenantId(req);
  if (tenantId === undefined) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Missing tenantId parameter' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  const result = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('tenant_id', tenantId)
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
  enabled: boolean;
  phone_number: string | null;
  waba_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const FIRST_INDEX = 0;

function extractCredentialFields(raw: unknown): { phone: string | null; waba: string | null } {
  if (Array.isArray(raw)) {
    const first: unknown = raw[FIRST_INDEX];
    return extractCredentialFields(first);
  }
  if (!isRecord(raw)) return { phone: null, waba: null };
  const { phone_number: phone, waba_id: waba } = raw;
  return {
    phone: typeof phone === 'string' ? phone : null,
    waba: typeof waba === 'string' ? waba : null,
  };
}

function toConnection(value: unknown): ConnectionListRow | null {
  if (!isRecord(value)) return null;
  const { id, agent_id: agentId, enabled, whatsapp_credentials: creds } = value;
  if (typeof id !== 'string' || typeof agentId !== 'string') return null;
  const { phone, waba } = extractCredentialFields(creds);
  return {
    id,
    agent_id: agentId,
    enabled: enabled === true,
    phone_number: phone,
    waba_id: waba,
  };
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
 * GET /tenants/:tenantId/whatsapp-templates/connections
 * Returns WhatsApp channel_connections for the tenant, enriched with phone_number.
 */
export async function handleListConnections(req: Request, res: AuthenticatedResponse): Promise<void> {
  const tenantId = getTenantId(req);
  if (tenantId === undefined) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Missing tenantId parameter' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const result = await supabase
      .from('channel_connections')
      .select('id, agent_id, enabled, whatsapp_credentials(phone_number, waba_id)')
      .eq('tenant_id', tenantId)
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
