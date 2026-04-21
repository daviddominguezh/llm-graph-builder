'use client';

import type { OrgInvitationRow } from '@/app/lib/orgMemberTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface InvitationRowProps {
  invitation: OrgInvitationRow;
  isOwner: boolean;
  onCancel: (invitation: OrgInvitationRow) => void;
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

function InvitationAvatar({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase() || '?';
  const colorClass = AVATAR_COLORS[hashToIndex(email)] ?? AVATAR_COLORS[0];

  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold opacity-60 ${colorClass}`}>
      {initial}
    </div>
  );
}

const ROLE_BADGE_VARIANTS: Record<string, string> = {
  admin: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  developer: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  agent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

export function InvitationRow({ invitation, isOwner, onCancel }: InvitationRowProps) {
  const t = useTranslations('team');
  const roleBadgeClass = ROLE_BADGE_VARIANTS[invitation.role] ?? '';

  return (
    <div className="flex h-12 items-center gap-3 rounded-md border border-dashed bg-card px-3 transition-colors">
      <InvitationAvatar email={invitation.email} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-muted-foreground">{invitation.email}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          {t('pending')}
        </Badge>
        <Badge variant="outline" className={roleBadgeClass}>
          {t(`roles.${invitation.role}`)}
        </Badge>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onCancel(invitation)}
            aria-label={t('cancelInviteConfirm')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
