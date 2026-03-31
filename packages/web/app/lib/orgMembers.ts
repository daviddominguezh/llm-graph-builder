import { fetchFromBackend } from './backendProxy';
import type { OrgMemberRow } from './orgMemberTypes';

export type { OrgMemberRow, OrgRole } from './orgMemberTypes';
export { ASSIGNABLE_ROLES, ORG_ROLES } from './orgMemberTypes';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isOrgMemberArray(val: unknown): val is OrgMemberRow[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function orgMembersPath(orgId: string): string {
  return `/orgs/${encodeURIComponent(orgId)}/members`;
}

function memberPath(orgId: string, userId: string): string {
  return `${orgMembersPath(orgId)}/${encodeURIComponent(userId)}`;
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function getOrgMembers(
  orgId: string
): Promise<{ result: OrgMemberRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', orgMembersPath(orgId));
    if (!isOrgMemberArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function addOrgMember(
  orgId: string,
  email: string,
  role: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('POST', orgMembersPath(orgId), { email, role });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', memberPath(orgId, userId), { role });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function removeMember(orgId: string, userId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', memberPath(orgId, userId));
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
