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

const AVATAR_COLORS = [
  'bg-violet-600/15 text-violet-700 dark:text-violet-400',
  'bg-sky-600/15 text-sky-700 dark:text-sky-400',
  'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  'bg-amber-600/15 text-amber-700 dark:text-amber-400',
  'bg-rose-600/15 text-rose-700 dark:text-rose-400',
  'bg-teal-600/15 text-teal-700 dark:text-teal-400',
  'bg-indigo-600/15 text-indigo-700 dark:text-indigo-400',
  'bg-orange-600/15 text-orange-700 dark:text-orange-400',
];

function hashToIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

function MemberAvatar({ name, email }: { name: string; email: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const colorClass = AVATAR_COLORS[hashToIndex(email)] ?? AVATAR_COLORS[0];

  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorClass}`}>
      {initial}
    </div>
  );
}

function MemberInfo({ member, isCurrentUser }: { member: OrgMemberRow; isCurrentUser: boolean }) {
  const t = useTranslations('team');

  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium leading-tight">
        {member.full_name || member.email}
        {isCurrentUser && (
          <span className="text-muted-foreground ml-1 text-xs font-normal">({t('you')})</span>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">{member.email}</span>
    </div>
  );
}

const ROLE_BADGE_VARIANTS: Record<string, string> = {
  owner: 'bg-primary/10 text-primary border-primary/20',
  admin: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  developer: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  agent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

function RoleBadge({ role }: { role: string }) {
  const t = useTranslations('team');
  const classes = ROLE_BADGE_VARIANTS[role] ?? '';

  return (
    <Badge variant="outline" className={classes}>
      {t(`roles.${role}`)}
    </Badge>
  );
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

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function canEditRole(props: MemberRowProps): boolean {
  return props.isOwner && props.member.user_id !== props.currentUserId;
}

function canRemove(props: MemberRowProps): boolean {
  return props.isOwner && props.member.user_id !== props.currentUserId;
}

export function MemberRow(props: MemberRowProps) {
  const t = useTranslations('team');
  const { member, onRemove } = props;
  const isCurrentUser = member.user_id === props.currentUserId;

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-card/80">
      <MemberAvatar name={member.full_name || member.email} email={member.email} />
      <MemberInfo member={member} isCurrentUser={isCurrentUser} />
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
          {formatJoinDate(member.joined_at)}
        </span>
        {canEditRole(props) ? <RoleSelect {...props} /> : <RoleBadge role={member.role} />}
        {canRemove(props) && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(member)}
            aria-label={t('removeConfirm')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
