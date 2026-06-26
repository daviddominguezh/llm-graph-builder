'use client';

import { createAgentAction } from '@/app/actions/agents';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

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

    const { agent, error } = await createAgentAction({
      orgId,
      name,
      description,
      category: 'customer-support',
      isPublic: false,
    });

    if (error !== null || agent === null) {
      setLoading(false);
      toast.error(error ?? t('createError'));
      return;
    }

    onOpenChange(false);
    router.push(`/orgs/${orgSlug}/editor/${agent.slug}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateAgentFields
        nameError={nameError}
        name={name}
        onNameChange={setName}
        description={description}
        onDescriptionChange={setDescription}
      />
      <DialogFooter>
        <Button type="submit" disabled={loading || name.trim() === '' || description.trim() === ''}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface CreateAgentFieldsProps {
  nameError: string;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}

function CreateAgentFields(props: CreateAgentFieldsProps) {
  const { nameError, name, onNameChange, description, onDescriptionChange } = props;
  const t = useTranslations('agents');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-name">{t('name')}</Label>
        <Input
          id="agent-name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-description">{t('description')}</Label>
        <Textarea
          id="agent-description"
          name="description"
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
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
