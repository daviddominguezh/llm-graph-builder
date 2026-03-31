import { fetchFromBackend } from './backendProxy';
import type { InviteStatus, OrgInvitationRow, OrgMemberRow } from './orgMemberTypes';

export type { InviteStatus, OrgInvitationRow, OrgMemberRow, OrgRole } from './orgMemberTypes';
export { ASSIGNABLE_ROLES, ORG_ROLES } from './orgMemberTypes';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isOrgMemberArray(val: unknown): val is OrgMemberRow[] {
  return Array.isArray(val);
}

function isOrgInvitationArray(val: unknown): val is OrgInvitationRow[] {
  return Array.isArray(val);
}

interface AddMemberResponse {
  status: InviteStatus;
}

function isAddMemberResponse(val: unknown): val is AddMemberResponse {
  return typeof val === 'object' && val !== null && 'status' in val;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function orgPath(orgId: string, sub: string): string {
  return `/orgs/${encodeURIComponent(orgId)}/${sub}`;
}

function memberPath(orgId: string, userId: string): string {
  return `${orgPath(orgId, 'members')}/${encodeURIComponent(userId)}`;
}

function invitationPath(orgId: string, invitationId: string): string {
  return `${orgPath(orgId, 'invitations')}/${encodeURIComponent(invitationId)}`;
}

/* ------------------------------------------------------------------ */
/*  Member queries                                                     */
/* ------------------------------------------------------------------ */

export async function getOrgMembers(
  orgId: string
): Promise<{ result: OrgMemberRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', orgPath(orgId, 'members'));
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
): Promise<{ result: InviteStatus | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', orgPath(orgId, 'members'), { email, role });
    if (!isAddMemberResponse(data)) return { result: null, error: 'Invalid response' };
    return { result: data.status, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
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

/* ------------------------------------------------------------------ */
/*  Invitation queries                                                 */
/* ------------------------------------------------------------------ */

export async function getOrgInvitations(
  orgId: string
): Promise<{ result: OrgInvitationRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', orgPath(orgId, 'invitations'));
    if (!isOrgInvitationArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function cancelInvitation(
  orgId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', invitationPath(orgId, invitationId));
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
