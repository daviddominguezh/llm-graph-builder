'use client';

import { addOrgMemberAction } from '@/app/actions/orgMembers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { InviteEntry } from './InviteRowEntry';
import { InviteRowEntry } from './InviteRowEntry';

export interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  existingEmails: string[];
  onInvited: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createEntry(): InviteEntry {
  return { id: crypto.randomUUID(), email: '', role: 'developer', error: '' };
}

function validateEntry(
  entry: InviteEntry,
  allEmails: string[],
  existingEmails: Set<string>,
  t: (key: string) => string
): string {
  const trimmed = entry.email.trim().toLowerCase();
  if (trimmed === '') return '';
  if (!EMAIL_REGEX.test(trimmed)) return t('emailInvalid');
  if (existingEmails.has(trimmed)) return t('alreadyMemberShort');
  const dupes = allEmails.filter((e) => e === trimmed);
  if (dupes.length > 1) return t('duplicateEmail');
  return '';
}

function validateAll(entries: InviteEntry[], existingEmails: Set<string>, t: (key: string) => string): InviteEntry[] {
  const allEmails = entries.map((e) => e.email.trim().toLowerCase());
  return entries.map((entry) => ({
    ...entry,
    error: validateEntry(entry, allEmails, existingEmails, t),
  }));
}

function canSubmitEntries(entries: InviteEntry[]): boolean {
  const filled = entries.filter((e) => e.email.trim() !== '');
  if (filled.length === 0) return false;
  return filled.every((e) => e.error === '' && EMAIL_REGEX.test(e.email.trim()));
}

async function submitEntries(
  entries: InviteEntry[],
  orgId: string,
  t: (key: string, values?: Record<string, string | number>) => string
): Promise<{ succeeded: number; failed: number }> {
  const filled = entries.filter((e) => e.email.trim() !== '');
  const results = await Promise.all(
    filled.map(async (entry) => {
      const { result, error } = await addOrgMemberAction(orgId, entry.email.trim(), entry.role);
      if (error !== null || result === null) return false;
      if (result === 'already_member' || result === 'already_invited') {
        toast.info(t(result === 'already_member' ? 'alreadyMember' : 'alreadyInvited', { email: entry.email }));
        return true;
      }
      return true;
    })
  );
  const succeeded = results.filter(Boolean).length;
  return { succeeded, failed: results.length - succeeded };
}

function InviteForm({ orgId, existingEmails, onOpenChange, onInvited }: InviteMemberDialogProps) {
  const t = useTranslations('team');
  const [entries, setEntries] = useState<InviteEntry[]>([createEntry()]);
  const [loading, setLoading] = useState(false);
  const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()));
  const validated = validateAll(entries, existingSet, t);
  const canSubmit = canSubmitEntries(validated) && !loading;

  const updateEntry = useCallback((id: string, field: 'email' | 'role', value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value, error: '' } : e)));
  }, []);

  function addRow() {
    setEntries((prev) => [...prev, createEntry()]);
  }

  function removeRow(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSubmit() {
    const checked = validateAll(entries, existingSet, t);
    if (!canSubmitEntries(checked)) {
      setEntries(checked);
      return;
    }

    setLoading(true);
    const { succeeded, failed } = await submitEntries(checked, orgId, t);
    setLoading(false);

    if (failed > 0) {
      toast.error(t('batchInvitePartial', { failed }));
    }
    if (succeeded > 0) {
      toast.success(t('batchInviteSuccess', { count: succeeded }));
      onOpenChange(false);
      onInvited();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1">
        {validated.map((entry) => (
          <InviteRowEntry
            key={entry.id}
            entry={entry}
            canRemove={entries.length > 1}
            onEmailChange={(id, email) => updateEntry(id, 'email', email)}
            onRoleChange={(id, role) => updateEntry(id, 'role', role)}
            onRemove={removeRow}
          />
        ))}
        <Button variant="ghost" size="sm" className="self-start shrink-0 text-muted-foreground rounded-md" onClick={addRow}>
          <Plus className="size-3.5" />
          {t('addAnother')}
        </Button>
      </div>
      <DialogFooter className="shrink-0">
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            t('inviteCount', { count: validated.filter((e) => e.email.trim() !== '').length })
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function InviteMemberDialog(props: InviteMemberDialogProps) {
  const t = useTranslations('team');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:h-[420px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('inviteTitle')}</DialogTitle>
          <DialogDescription>{t('inviteDescription')}</DialogDescription>
        </DialogHeader>
        {props.open && <InviteForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}
