import { fetchFromBackend } from './backendProxy';

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
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTenantRow(value: unknown): value is TenantRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'name' in value && 'org_id' in value && 'slug' in value;
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

export async function deleteTenant(tenantId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/tenants/${encodeURIComponent(tenantId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
