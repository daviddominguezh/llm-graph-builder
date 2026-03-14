'use client';

import { createEnvVariableAction } from '@/app/actions/org-env-variables';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

interface CreateEnvVariableDialogProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface EnvVariableFormProps {
  orgId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormFieldsProps {
  nameError: string;
  isSecret: boolean;
  onIsSecretChange: (checked: boolean) => void;
}

function FormFields({ nameError, isSecret, onIsSecretChange }: FormFieldsProps) {
  const t = useTranslations('envVariables');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="var-name">{t('name')}</Label>
        <Input id="var-name" name="name" placeholder={t('namePlaceholder')} required />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="var-value">{t('value')}</Label>
        <Input
          id="var-value"
          name="value"
          type={isSecret ? 'password' : 'text'}
          placeholder={t('valuePlaceholder')}
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="var-secret"
          checked={isSecret}
          onCheckedChange={(checked) => onIsSecretChange(checked === true)}
        />
        <Label htmlFor="var-secret">{t('secret')}</Label>
      </div>
    </>
  );
}

function EnvVariableForm({ orgId, onOpenChange, onCreated }: EnvVariableFormProps) {
  const t = useTranslations('envVariables');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [isSecret, setIsSecret] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const value = formData.get('value') as string;

    if (!NAME_PATTERN.test(name)) {
      setNameError(name === '' ? t('nameRequired') : t('nameFormat'));
      return;
    }

    setLoading(true);
    setNameError('');

    const { error } = await createEnvVariableAction(orgId, name, value, isSecret);

    if (error !== null) {
      setLoading(false);
      toast.error(t('createError'));
      return;
    }

    onOpenChange(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormFields nameError={nameError} isSecret={isSecret} onIsSecretChange={setIsSecret} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateEnvVariableDialog({
  orgId,
  open,
  onOpenChange,
  onCreated,
}: CreateEnvVariableDialogProps) {
  const t = useTranslations('envVariables');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <EnvVariableForm orgId={orgId} onOpenChange={onOpenChange} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
