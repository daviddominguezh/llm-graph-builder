import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OrgMemberRow {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  joined_at: string;
}

export interface OrgInvitationRow {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isOrgMemberRow(value: unknown): value is OrgMemberRow {
  return (
    typeof value === 'object' && value !== null && 'user_id' in value && 'role' in value && 'email' in value
  );
}

function isUnknownArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapRows(data: unknown[]): OrgMemberRow[] {
  return data.reduce<OrgMemberRow[]>((acc, row) => {
    if (isOrgMemberRow(row)) acc.push(row);
    return acc;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getOrgMembers(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: OrgMemberRow[]; error: string | null }> {
  const result = await supabase.rpc('get_org_members', { p_org_id: orgId });

  if (result.error !== null) return { result: [], error: result.error.message };
  const rawData: unknown = result.data;
  if (!isUnknownArray(rawData)) return { result: [], error: 'Invalid members data' };
  return { result: mapRows(rawData), error: null };
}

export async function addOrgMemberByEmail(
  supabase: SupabaseClient,
  orgId: string,
  email: string,
  role: string
): Promise<{ result: string | null; error: string | null }> {
  const result = await supabase.rpc('add_org_member_by_email', {
    p_org_id: orgId,
    p_email: email,
    p_role: role,
  });

  if (result.error !== null) return { result: null, error: result.error.message };
  const rawData: unknown = result.data;
  if (typeof rawData !== 'string') return { result: null, error: 'Invalid response' };
  return { result: rawData, error: null };
}

export async function updateOrgMemberRole(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  role: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_org_member_role', {
    p_org_id: orgId,
    p_user_id: userId,
    p_role: role,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function removeOrgMember(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_org_member', {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  Invitation queries                                                 */
/* ------------------------------------------------------------------ */

function isOrgInvitationRow(value: unknown): value is OrgInvitationRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'email' in value && 'role' in value;
}

function mapInvitationRows(data: unknown[]): OrgInvitationRow[] {
  return data.reduce<OrgInvitationRow[]>((acc, row) => {
    if (isOrgInvitationRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function getOrgInvitations(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: OrgInvitationRow[]; error: string | null }> {
  const result = await supabase.rpc('get_org_invitations', { p_org_id: orgId });

  if (result.error !== null) return { result: [], error: result.error.message };
  const rawData: unknown = result.data;
  if (!isUnknownArray(rawData)) return { result: [], error: 'Invalid invitations data' };
  return { result: mapInvitationRows(rawData), error: null };
}

export async function cancelOrgInvitation(
  supabase: SupabaseClient,
  orgId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_org_invitation', {
    p_org_id: orgId,
    p_invitation_id: invitationId,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}
