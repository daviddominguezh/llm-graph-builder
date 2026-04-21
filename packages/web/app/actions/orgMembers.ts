'use server';

import {
  type InviteStatus,
  type OrgInvitationRow,
  type OrgMemberRow,
  addOrgMember,
  cancelInvitation,
  getOrgInvitations,
  getOrgMembers,
  removeMember,
  updateMemberRole,
} from '@/app/lib/orgMembers';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function getOrgMembersAction(
  orgId: string
): Promise<{ result: OrgMemberRow[]; error: string | null }> {
  serverLog('[getOrgMembersAction] orgId:', orgId);
  return await getOrgMembers(orgId);
}

export async function addOrgMemberAction(
  orgId: string,
  email: string,
  role: string
): Promise<{ result: InviteStatus | null; error: string | null }> {
  serverLog('[addOrgMemberAction] orgId:', orgId, 'email:', email, 'role:', role);
  const res = await addOrgMember(orgId, email, role);
  if (res.error !== null) serverError('[addOrgMemberAction] error:', res.error);
  return res;
}

export async function updateMemberRoleAction(
  orgId: string,
  userId: string,
  role: string
): Promise<{ error: string | null }> {
  serverLog('[updateMemberRoleAction] orgId:', orgId, 'userId:', userId, 'role:', role);
  const res = await updateMemberRole(orgId, userId, role);
  if (res.error !== null) serverError('[updateMemberRoleAction] error:', res.error);
  return res;
}

export async function removeMemberAction(orgId: string, userId: string): Promise<{ error: string | null }> {
  serverLog('[removeMemberAction] orgId:', orgId, 'userId:', userId);
  const res = await removeMember(orgId, userId);
  if (res.error !== null) serverError('[removeMemberAction] error:', res.error);
  return res;
}

export async function getOrgInvitationsAction(
  orgId: string
): Promise<{ result: OrgInvitationRow[]; error: string | null }> {
  serverLog('[getOrgInvitationsAction] orgId:', orgId);
  return await getOrgInvitations(orgId);
}

export async function cancelInvitationAction(
  orgId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  serverLog('[cancelInvitationAction] orgId:', orgId, 'invitationId:', invitationId);
  const res = await cancelInvitation(orgId, invitationId);
  if (res.error !== null) serverError('[cancelInvitationAction] error:', res.error);
  return res;
}
