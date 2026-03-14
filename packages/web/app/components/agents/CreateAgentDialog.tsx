'use client';

import { createAgentAction } from '@/app/actions/agents';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
}

interface CreateAgentFormProps {
  orgId: string;
  orgSlug: string;
  onOpenChange: (open: boolean) => void;
}

function CreateAgentForm({ orgId, orgSlug, onOpenChange }: CreateAgentFormProps) {
  const t = useTranslations('agents');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const description = (formData.get('description') as string | null) ?? '';

    if (name === '') {
      setNameError(t('nameRequired'));
      return;
    }

    setLoading(true);
    setNameError('');

    const { agent, error } = await createAgentAction(orgId, name, description);

    if (error !== null || agent === null) {
      setLoading(false);
      toast.error(error ?? t('createError'));
      return;
    }

    onOpenChange(false);
    router.refresh();
    router.push(`/orgs/${orgSlug}/editor/${agent.slug}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateAgentFields nameError={nameError} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateAgentFields({ nameError }: { nameError: string }) {
  const t = useTranslations('agents');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-name">{t('name')}</Label>
        <Input id="agent-name" name="name" placeholder={t('namePlaceholder')} required />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-description">{t('description')}</Label>
        <Textarea id="agent-description" name="description" placeholder={t('descriptionPlaceholder')} />
      </div>
    </>
  );
}

export function CreateAgentDialog({ open, onOpenChange, orgId, orgSlug }: CreateAgentDialogProps) {
  const t = useTranslations('agents');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
        </DialogHeader>
        <CreateAgentForm onOpenChange={onOpenChange} orgId={orgId} orgSlug={orgSlug} />
      </DialogContent>
    </Dialog>
  );
}
