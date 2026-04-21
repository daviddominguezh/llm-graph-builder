/* ------------------------------------------------------------------ */
/*  Shared types & constants for org members (client-safe)             */
/* ------------------------------------------------------------------ */

export interface OrgMemberRow {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  joined_at: string;
}

export type OrgRole = 'owner' | 'admin' | 'developer' | 'agent';

export const ORG_ROLES: OrgRole[] = ['owner', 'admin', 'developer', 'agent'];

export const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'developer', 'agent'];

export interface OrgInvitationRow {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: string;
}

export type InviteStatus = 'added' | 'invited' | 'already_member' | 'already_invited';
