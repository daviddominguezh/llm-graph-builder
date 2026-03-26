'use client';

import { createEnvVariableAction } from '@/app/actions/orgEnvVariables';
import { Button } from '@/components/ui/button';
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
  onNameChange: (value: string) => void;
}

function FormFields({ nameError, onNameChange }: FormFieldsProps) {
  const t = useTranslations('envVariables');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="var-name">{t('name')}</Label>
        <Input
          id="var-name"
          name="name"
          autoComplete="off"
          placeholder={t('namePlaceholder')}
          required
          onChange={(e) => {
            e.target.value = e.target.value.toUpperCase();
            onNameChange(e.target.value);
          }}
        />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="var-value">{t('value')}</Label>
        <Input
          autoComplete="off"
          id="var-value"
          name="value"
          className="font-mono"
          placeholder={t('valuePlaceholder')}
          required
        />
      </div>
    </>
  );
}

function validateName(name: string, t: (key: string) => string): string {
  if (name === '') return '';
  if (!NAME_PATTERN.test(name)) return t('nameFormat');
  return '';
}

function EnvVariableForm({ orgId, onOpenChange, onCreated }: EnvVariableFormProps) {
  const t = useTranslations('envVariables');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  function handleNameChange(value: string) {
    setNameError(validateName(value, t));
  }

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

    const { error } = await createEnvVariableAction(orgId, name, value, true);

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
      <FormFields nameError={nameError} onNameChange={handleNameChange} />
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
