'use client';

import { getOrgMembersAction, updateMemberRoleAction } from '@/app/actions/orgMembers';
import type { OrgMemberRow, OrgRole } from '@/app/lib/orgMembers';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberRow } from './MemberRow';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { TransferOwnershipDialog } from './TransferOwnershipDialog';

interface TeamSectionProps {
  orgId: string;
  initialMembers: OrgMemberRow[];
  currentUserRole: string | null;
  currentUserId: string;
}

interface TransferTarget {
  userId: string;
  name: string;
}

interface MemberListProps {
  members: OrgMemberRow[];
  isOwner: boolean;
  currentUserId: string;
  onRoleChange: (userId: string, name: string, role: OrgRole) => void;
  onRemove: (member: OrgMemberRow) => void;
  onInvite: () => void;
}

function EmptyState({ isOwner, onInvite }: { isOwner: boolean; onInvite: () => void }) {
  const t = useTranslations('team');

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-card/50 px-4 py-8 text-center">
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

function MemberList(props: MemberListProps) {
  if (props.members.length <= 1) {
    return <EmptyState isOwner={props.isOwner} onInvite={props.onInvite} />;
  }

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
    </div>
  );
}

function useTeamActions(orgId: string, refreshMembers: () => Promise<void>) {
  const t = useTranslations('team');

  const handleRoleChange = useCallback(
    async (userId: string, name: string, role: OrgRole): Promise<TransferTarget | null> => {
      if (role === 'owner') return { userId, name };

      const { error } = await updateMemberRoleAction(orgId, userId, role);
      if (error !== null) {
        toast.error(t('roleChangeError'));
      } else {
        toast.success(t('roleChangeSuccess', { name, role: t(`roles.${role}`) }));
        await refreshMembers();
      }
      return null;
    },
    [orgId, refreshMembers, t]
  );

  return { handleRoleChange };
}

export function TeamSection({ orgId, initialMembers, currentUserRole, currentUserId }: TeamSectionProps) {
  const t = useTranslations('team');
  const isOwner = currentUserRole === 'owner';

  const [members, setMembers] = useState<OrgMemberRow[]>(initialMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OrgMemberRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);

  const refreshMembers = useCallback(async () => {
    const { result } = await getOrgMembersAction(orgId);
    setMembers(result);
  }, [orgId]);

  const { handleRoleChange } = useTeamActions(orgId, refreshMembers);

  async function onRoleChange(userId: string, name: string, role: OrgRole) {
    const pending = await handleRoleChange(userId, name, role);
    if (pending !== null) setTransferTarget(pending);
  }

  return (
    <Card className="bg-background ring-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {t('description')}
          {members.length > 0 && (
            <span className="ml-1 text-muted-foreground/60">{t('memberCount', { count: members.length })}</span>
          )}
        </CardDescription>
        {isOwner && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" />
              {t('invite')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <MemberList
          members={members}
          isOwner={isOwner}
          currentUserId={currentUserId}
          onRoleChange={onRoleChange}
          onRemove={setRemoveTarget}
          onInvite={() => setInviteOpen(true)}
        />
      </CardContent>
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgId={orgId}
        onInvited={refreshMembers}
      />
      {removeTarget !== null && (
        <RemoveMemberDialog
          open={removeTarget !== null}
          onOpenChange={() => setRemoveTarget(null)}
          orgId={orgId}
          userId={removeTarget.user_id}
          memberName={removeTarget.full_name || removeTarget.email}
          onRemoved={refreshMembers}
        />
      )}
      {transferTarget !== null && (
        <TransferOwnershipDialog
          open={transferTarget !== null}
          onOpenChange={() => setTransferTarget(null)}
          orgId={orgId}
          userId={transferTarget.userId}
          memberName={transferTarget.name}
          onTransferred={refreshMembers}
        />
      )}
    </Card>
  );
}
