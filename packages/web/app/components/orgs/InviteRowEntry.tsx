'use client';

import { ASSIGNABLE_ROLES, type OrgRole } from '@/app/lib/orgMemberTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface InviteEntry {
  id: string;
  email: string;
  role: OrgRole;
  error: string;
}

interface InviteRowEntryProps {
  entry: InviteEntry;
  canRemove: boolean;
  onEmailChange: (id: string, email: string) => void;
  onRoleChange: (id: string, role: OrgRole) => void;
  onRemove: (id: string) => void;
}

export function InviteRowEntry({ entry, canRemove, onEmailChange, onRoleChange, onRemove }: InviteRowEntryProps) {
  const t = useTranslations('team');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="email"
          autoComplete="off"
          placeholder={t('emailPlaceholder')}
          value={entry.email}
          className="flex-1"
          onChange={(e) => onEmailChange(entry.id, e.target.value)}
        />
        <Select value={entry.role} onValueChange={(val) => val !== null && onRoleChange(entry.id, val as OrgRole)}>
          <SelectTrigger className="w-32 shrink-0">
            <span className="flex flex-1 text-left">{t(`roles.${entry.role}`)}</span>
          </SelectTrigger>
          <SelectContent side="bottom" alignItemWithTrigger={false}>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r} label={t(`roles.${r}`)}>
                {t(`roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            disabled={!canRemove}
            onClick={() => onRemove(entry.id)}
            aria-label={t('removeRow')}
          >
            <Trash2 className="size-3.5" />
          </Button>
      </div>
      {entry.error !== '' && <p className="text-destructive text-xs pl-0.5">{entry.error}</p>}
    </div>
  );
}
