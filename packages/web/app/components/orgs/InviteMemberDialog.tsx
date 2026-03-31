'use client';

import { addOrgMemberAction } from '@/app/actions/orgMembers';
import { ASSIGNABLE_ROLES, type OrgRole } from '@/app/lib/orgMemberTypes';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onInvited: () => void;
}

function RoleSelectField({ role, onRoleChange }: { role: OrgRole; onRoleChange: (r: OrgRole) => void }) {
  const t = useTranslations('team');

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('role')}</Label>
      <Select value={role} onValueChange={(val) => val !== null && onRoleChange(val as OrgRole)}>
        <SelectTrigger className="w-full">
          <span className="flex flex-1 text-left">{t(`roles.${role}`)}</span>
        </SelectTrigger>
        <SelectContent side="bottom" alignItemWithTrigger={false}>
          {ASSIGNABLE_ROLES.map((r) => (
            <SelectItem key={r} value={r} label={t(`roles.${r}`)}>
              <div className="flex flex-col">
                <span>{t(`roles.${r}`)}</span>
                <span className="text-muted-foreground text-[10px] leading-tight">
                  {t(`roleHints.${r}`)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return value !== '' && EMAIL_REGEX.test(value);
}

function InviteForm({ orgId, onOpenChange, onInvited }: InviteMemberDialogProps) {
  const t = useTranslations('team');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [role, setRole] = useState<OrgRole>('developer');
  const canSubmit = isValidEmail(email) && !loading;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!isValidEmail(trimmed)) {
      setEmailError(t('emailInvalid'));
      return;
    }

    setLoading(true);
    setEmailError('');

    const { result, error } = await addOrgMemberAction(orgId, trimmed, role);

    if (error !== null || result === null) {
      setLoading(false);
      toast.error(error ?? t('inviteError'));
      return;
    }

    if (result === 'already_member' || result === 'already_invited') {
      setLoading(false);
      const key = result === 'already_member' ? 'alreadyMember' : 'alreadyInvited';
      toast.info(t(key, { email: trimmed }));
      return;
    }

    const toastKey = result === 'invited' ? 'invitePendingSuccess' : 'inviteSuccess';
    toast.success(t(toastKey, { email: trimmed }));
    onOpenChange(false);
    onInvited();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="invite-email">{t('email')}</Label>
        <Input
          id="invite-email"
          type="email"
          autoFocus
          autoComplete="off"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError('');
          }}
        />
        {emailError !== '' && <p className="text-destructive text-xs">{emailError}</p>}
      </div>
      <RoleSelectField role={role} onRoleChange={setRole} />
      <DialogFooter>
        <Button type="submit" disabled={!canSubmit}>
          {loading ? t('inviting') : t('invite')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function InviteMemberDialog(props: InviteMemberDialogProps) {
  const t = useTranslations('team');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('inviteTitle')}</DialogTitle>
        </DialogHeader>
        {props.open && <InviteForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}
