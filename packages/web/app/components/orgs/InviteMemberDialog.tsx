'use client';

import { addOrgMemberAction } from '@/app/actions/orgMembers';
import { ASSIGNABLE_ROLES, type OrgRole } from '@/app/lib/orgMemberTypes';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNABLE_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
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

function InviteForm({ orgId, onOpenChange, onInvited }: InviteMemberDialogProps) {
  const t = useTranslations('team');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [role, setRole] = useState<OrgRole>('developer');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string).trim();

    if (email === '') {
      setEmailError(t('emailRequired'));
      return;
    }

    setLoading(true);
    setEmailError('');

    const { result, error } = await addOrgMemberAction(orgId, email, role);

    if (error !== null || result === null) {
      setLoading(false);
      toast.error(error ?? t('inviteError'));
      return;
    }

    if (result === 'already_member' || result === 'already_invited') {
      setLoading(false);
      const key = result === 'already_member' ? 'alreadyMember' : 'alreadyInvited';
      toast.info(t(key, { email }));
      return;
    }

    const toastKey = result === 'invited' ? 'invitePendingSuccess' : 'inviteSuccess';
    toast.success(t(toastKey, { email }));
    onOpenChange(false);
    onInvited();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="invite-email">{t('email')}</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoFocus
          autoComplete="off"
          placeholder={t('emailPlaceholder')}
          required
          onChange={() => setEmailError('')}
        />
        {emailError !== '' && <p className="text-destructive text-xs">{emailError}</p>}
      </div>
      <RoleSelectField role={role} onRoleChange={setRole} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
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
