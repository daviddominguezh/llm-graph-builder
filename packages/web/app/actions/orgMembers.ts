'use server';

import {
  type OrgMemberRow,
  addOrgMember,
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
): Promise<{ error: string | null }> {
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
