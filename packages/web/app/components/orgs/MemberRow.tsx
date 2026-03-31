'use client';

import type { OrgMemberRow, OrgRole } from '@/app/lib/orgMembers';
import { ORG_ROLES } from '@/app/lib/orgMembers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface MemberRowProps {
  member: OrgMemberRow;
  isOwner: boolean;
  currentUserId: string;
  onRoleChange: (userId: string, name: string, role: OrgRole) => void;
  onRemove: (member: OrgMemberRow) => void;
}

function MemberAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {initial}
    </div>
  );
}

function MemberInfo({ member }: { member: OrgMemberRow }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium leading-tight">
        {member.full_name || member.email}
      </span>
      <span className="truncate text-xs text-muted-foreground">{member.email}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const t = useTranslations('team');
  const variant = role === 'owner' ? 'default' : 'secondary';

  return <Badge variant={variant}>{t(`roles.${role}`)}</Badge>;
}

function RoleSelect({ member, onRoleChange }: Pick<MemberRowProps, 'member' | 'onRoleChange'>) {
  const t = useTranslations('team');

  function handleChange(value: string | null) {
    if (value === null) return;
    onRoleChange(member.user_id, member.full_name || member.email, value as OrgRole);
  }

  return (
    <Select value={member.role} onValueChange={handleChange}>
      <SelectTrigger className="w-28" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORG_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {t(`roles.${r}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function canEditRole(props: MemberRowProps): boolean {
  return props.isOwner && props.member.user_id !== props.currentUserId;
}

function canRemove(props: MemberRowProps): boolean {
  return props.isOwner && props.member.user_id !== props.currentUserId;
}

export function MemberRow(props: MemberRowProps) {
  const { member, onRemove } = props;

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <MemberAvatar name={member.full_name || member.email} />
      <MemberInfo member={member} />
      <div className="ml-auto flex items-center gap-2">
        {canEditRole(props) ? <RoleSelect {...props} /> : <RoleBadge role={member.role} />}
        {canRemove(props) && (
          <Button variant="destructive" size="sm" onClick={() => onRemove(member)}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
