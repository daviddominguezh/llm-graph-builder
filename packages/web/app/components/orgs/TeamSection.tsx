'use client';

import { getOrgInvitationsAction, getOrgMembersAction, updateMemberRoleAction } from '@/app/actions/orgMembers';
import type { OrgInvitationRow, OrgMemberRow, OrgRole } from '@/app/lib/orgMemberTypes';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { CancelInvitationDialog } from './CancelInvitationDialog';
import { InviteMemberDialog } from './InviteMemberDialog';
import { InvitationRow } from './InvitationRow';
import { MemberRow } from './MemberRow';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { TransferOwnershipDialog } from './TransferOwnershipDialog';

interface TeamSectionProps {
  orgId: string;
  initialMembers: OrgMemberRow[];
  initialInvitations: OrgInvitationRow[];
  currentUserRole: string | null;
  currentUserId: string;
}

interface TransferTarget {
  userId: string;
  name: string;
}

function EmptyState({ isOwner, onInvite }: { isOwner: boolean; onInvite: () => void }) {
  const t = useTranslations('team');

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-background px-4 py-8 text-center mt-3.5">
      <Users className="size-6 text-muted-foreground/50" />
      <p className="text-sm font-medium">{t('noMembers')}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{t('noMembersDescription')}</p>
      {isOwner && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onInvite}>
          <Plus className="size-3.5" />
          {t('invite')}
        </Button>
      )}
    </div>
  );
}

function MemberAndInvitationList(props: {
  members: OrgMemberRow[];
  invitations: OrgInvitationRow[];
  isOwner: boolean;
  currentUserId: string;
  onRoleChange: (userId: string, name: string, role: OrgRole) => void;
  onRemove: (member: OrgMemberRow) => void;
  onCancelInvite: (invitation: OrgInvitationRow) => void;
  onInvite: () => void;
}) {
  const showEmptyPrompt = props.members.length <= 1 && props.invitations.length === 0;

  return (
    <div className="flex flex-col gap-1.5">
      {props.members.map((member) => (
        <MemberRow
          key={member.user_id}
          member={member}
          isOwner={props.isOwner}
          currentUserId={props.currentUserId}
          onRoleChange={props.onRoleChange}
          onRemove={props.onRemove}
        />
      ))}
      {props.invitations.map((inv) => (
        <InvitationRow key={inv.id} invitation={inv} isOwner={props.isOwner} onCancel={props.onCancelInvite} />
      ))}
      {showEmptyPrompt && <EmptyState isOwner={props.isOwner} onInvite={props.onInvite} />}
    </div>
  );
}

function useTeamActions(orgId: string, refreshAll: () => Promise<void>) {
  const t = useTranslations('team');

  const handleRoleChange = useCallback(
    async (userId: string, name: string, role: OrgRole): Promise<TransferTarget | null> => {
      if (role === 'owner') return { userId, name };

      const { error } = await updateMemberRoleAction(orgId, userId, role);
      if (error !== null) {
        toast.error(t('roleChangeError'));
      } else {
        toast.success(t('roleChangeSuccess', { name, role: t(`roles.${role}`) }));
        await refreshAll();
      }
      return null;
    },
    [orgId, refreshAll, t]
  );

  return { handleRoleChange };
}

export function TeamSection(props: TeamSectionProps) {
  const { orgId, initialMembers, initialInvitations, currentUserRole, currentUserId } = props;
  const isOwner = currentUserRole === 'owner';

  const [members, setMembers] = useState<OrgMemberRow[]>(initialMembers);
  const [invitations, setInvitations] = useState<OrgInvitationRow[]>(initialInvitations);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OrgMemberRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrgInvitationRow | null>(null);

  const refreshAll = useCallback(async () => {
    const [membersRes, invitationsRes] = await Promise.all([
      getOrgMembersAction(orgId),
      getOrgInvitationsAction(orgId),
    ]);
    setMembers(membersRes.result);
    setInvitations(invitationsRes.result);
  }, [orgId]);

  const { handleRoleChange } = useTeamActions(orgId, refreshAll);
  const totalCount = members.length + invitations.length;
  const existingEmails = [...members.map((m) => m.email), ...invitations.map((i) => i.email)];

  async function onRoleChange(userId: string, name: string, role: OrgRole) {
    const pending = await handleRoleChange(userId, name, role);
    if (pending !== null) setTransferTarget(pending);
  }

  return (
    <Card className="bg-background ring-0">
      <TeamHeader isOwner={isOwner} totalCount={totalCount} onInvite={() => setInviteOpen(true)} />
      <CardContent>
        <MemberAndInvitationList
          members={members}
          invitations={invitations}
          isOwner={isOwner}
          currentUserId={currentUserId}
          onRoleChange={onRoleChange}
          onRemove={setRemoveTarget}
          onCancelInvite={setCancelTarget}
          onInvite={() => setInviteOpen(true)}
        />
      </CardContent>
      <TeamDialogs
        orgId={orgId}
        existingEmails={existingEmails}
        inviteOpen={inviteOpen}
        setInviteOpen={setInviteOpen}
        removeTarget={removeTarget}
        setRemoveTarget={setRemoveTarget}
        transferTarget={transferTarget}
        setTransferTarget={setTransferTarget}
        cancelTarget={cancelTarget}
        setCancelTarget={setCancelTarget}
        refreshAll={refreshAll}
      />
    </Card>
  );
}

function TeamHeader({ isOwner, totalCount, onInvite }: { isOwner: boolean; totalCount: number; onInvite: () => void }) {
  const t = useTranslations('team');

  return (
    <CardHeader>
      <CardTitle>{t('title')}</CardTitle>
      <CardDescription>
        {t('description')}
        {totalCount > 0 && (
          <span className="ml-1 text-muted-foreground/60">{t('memberCount', { count: totalCount })}</span>
        )}
      </CardDescription>
      {isOwner && (
        <CardAction>
          <Button variant="outline" size="sm" onClick={onInvite}>
            <Plus className="size-4" />
            {t('invite')}
          </Button>
        </CardAction>
      )}
    </CardHeader>
  );
}

function TeamDialogs({
  orgId,
  existingEmails,
  inviteOpen,
  setInviteOpen,
  removeTarget,
  setRemoveTarget,
  transferTarget,
  setTransferTarget,
  cancelTarget,
  setCancelTarget,
  refreshAll,
}: {
  orgId: string;
  existingEmails: string[];
  inviteOpen: boolean;
  setInviteOpen: (open: boolean) => void;
  removeTarget: OrgMemberRow | null;
  setRemoveTarget: (target: OrgMemberRow | null) => void;
  transferTarget: TransferTarget | null;
  setTransferTarget: (target: TransferTarget | null) => void;
  cancelTarget: OrgInvitationRow | null;
  setCancelTarget: (target: OrgInvitationRow | null) => void;
  refreshAll: () => Promise<void>;
}) {
  return (
    <>
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgId={orgId}
        existingEmails={existingEmails}
        onInvited={refreshAll}
      />
      {removeTarget !== null && (
        <RemoveMemberDialog
          open={removeTarget !== null}
          onOpenChange={() => setRemoveTarget(null)}
          orgId={orgId}
          userId={removeTarget.user_id}
          memberName={removeTarget.full_name || removeTarget.email}
          onRemoved={refreshAll}
        />
      )}
      {transferTarget !== null && (
        <TransferOwnershipDialog
          open={transferTarget !== null}
          onOpenChange={() => setTransferTarget(null)}
          orgId={orgId}
          userId={transferTarget.userId}
          memberName={transferTarget.name}
          onTransferred={refreshAll}
        />
      )}
      {cancelTarget !== null && (
        <CancelInvitationDialog
          open={cancelTarget !== null}
          onOpenChange={() => setCancelTarget(null)}
          orgId={orgId}
          invitationId={cancelTarget.id}
          email={cancelTarget.email}
          onCancelled={refreshAll}
        />
      )}
    </>
  );
}
