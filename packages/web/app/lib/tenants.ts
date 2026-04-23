import { fetchFromBackend } from './backendProxy';
import type { WhatsAppChannelConnection, WhatsAppTemplate } from './whatsappTemplates';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  web_channel_enabled: boolean;
  web_channel_allowed_origins: string[];
}

export interface WebChannelUpdate {
  enabled: boolean;
  allowedOrigins: string[];
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTenantRow(value: unknown): value is TenantRow {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    'name' in value &&
    'org_id' in value &&
    'slug' in value &&
    'web_channel_enabled' in value &&
    'web_channel_allowed_origins' in value
  );
}

function isTenantRowArray(val: unknown): val is TenantRow[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function getTenantsByOrg(orgId: string): Promise<{ result: TenantRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/tenants/${encodeURIComponent(orgId)}`);
    if (!isTenantRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createTenant(
  orgId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/tenants', { orgId, name });
    if (!isTenantRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateTenant(
  tenantId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('PATCH', `/tenants/${encodeURIComponent(tenantId)}`, { name });
    if (!isTenantRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function getTenantBySlug(
  orgId: string,
  slug: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/tenants/by-slug/${encodeURIComponent(orgId)}/${encodeURIComponent(slug)}`
    );
    if (!isTenantRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export interface TenantPageBundle {
  tenant: TenantRow;
  role: string | null;
  templates: WhatsAppTemplate[];
  connections: WhatsAppChannelConnection[];
}

function isTenantPageBundle(value: unknown): value is TenantPageBundle {
  if (typeof value !== 'object' || value === null) return false;
  if (!('tenant' in value) || !('templates' in value) || !('connections' in value)) return false;
  return isTenantRow(value.tenant) && Array.isArray(value.templates) && Array.isArray(value.connections);
}

export async function getTenantPageBundle(
  orgId: string,
  slug: string
): Promise<{ result: TenantPageBundle | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/tenants/by-slug/${encodeURIComponent(orgId)}/${encodeURIComponent(slug)}/page-bundle`
    );
    if (!isTenantPageBundle(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateTenantWebChannel(
  tenantId: string,
  fields: WebChannelUpdate
): Promise<{ result: TenantRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'PATCH',
      `/tenants/${encodeURIComponent(tenantId)}/web-channel`,
      fields
    );
    if (!isTenantRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteTenant(tenantId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/tenants/${encodeURIComponent(tenantId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
