import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgWithAgentCount extends OrgRow {
  agent_count: number;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isOrgRow(value: unknown): value is OrgRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'slug' in value;
}

function isOrgWithCountArray(val: unknown): val is OrgWithAgentCount[] {
  return Array.isArray(val);
}

interface UpdateOrgResult {
  result: string | null;
  error: string | null;
}

function isUpdateOrgResult(val: unknown): val is UpdateOrgResult {
  return typeof val === 'object' && val !== null && 'result' in val;
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

export async function getOrgsByUser(): Promise<{ result: OrgWithAgentCount[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', '/orgs');
    if (!isOrgWithCountArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function getOrgBySlug(slug: string): Promise<{ result: OrgRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/orgs/by-slug/${encodeURIComponent(slug)}`);
    if (!isOrgRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function createOrg(name: string): Promise<{ result: OrgRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/orgs', { name });
    if (!isOrgRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateOrgName(
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('PATCH', `/orgs/${encodeURIComponent(orgId)}`, { name });
    if (!isUpdateOrgResult(data)) return { result: null, error: 'Invalid response' };
    return data;
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteOrg(orgId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/orgs/${encodeURIComponent(orgId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function getOrgRole(orgId: string): Promise<string | null> {
  try {
    const data = await fetchFromBackend('GET', `/orgs/${encodeURIComponent(orgId)}/role`);
    if (typeof data === 'object' && data !== null && 'role' in data) {
      const { role } = data;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}
