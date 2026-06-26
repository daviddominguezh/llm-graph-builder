'use client';

import { createApiKeyAction } from '@/app/actions/apiKeys';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onCreated: () => void;
}

interface CreateApiKeyFieldsProps {
  nameError: string;
  keyError: string;
  onNameChange: (value: string) => void;
}

function CreateApiKeyFields({ nameError, keyError, onNameChange }: CreateApiKeyFieldsProps) {
  const t = useTranslations('apiKeys');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="key-name">{t('name')}</Label>
        <Input
          id="key-name"
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
        <Label htmlFor="key-value">{t('key')}</Label>
        <Input
          className="font-mono"
          autoComplete="off"
          id="key-value"
          name="keyValue"
          placeholder={t('keyPlaceholder')}
          required
        />
        {keyError !== '' && <p className="text-destructive text-xs">{keyError}</p>}
      </div>
    </>
  );
}

function validateName(name: string, t: (key: string) => string): string {
  if (name === '') return '';
  if (!NAME_PATTERN.test(name)) return t('nameFormat');
  return '';
}

function CreateApiKeyForm({ orgId, onOpenChange, onCreated }: CreateApiKeyDialogProps) {
  const t = useTranslations('apiKeys');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [keyError, setKeyError] = useState('');

  function handleNameChange(value: string) {
    setNameError(validateName(value, t));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const keyValue = (formData.get('keyValue') as string).trim();

    const errors = validateFields(name, keyValue, t);
    if (errors !== null) {
      setNameError(errors.nameError);
      setKeyError(errors.keyError);
      return;
    }

    setLoading(true);
    setNameError('');
    setKeyError('');

    const { result, error } = await createApiKeyAction(orgId, name, keyValue);

    if (error !== null || result === null) {
      setLoading(false);
      toast.error(error ?? t('createError'));
      return;
    }

    onOpenChange(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateApiKeyFields nameError={nameError} keyError={keyError} onNameChange={handleNameChange} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface FieldErrors {
  nameError: string;
  keyError: string;
}

function validateFields(name: string, keyValue: string, t: (key: string) => string): FieldErrors | null {
  const nameErr = name === '' ? t('nameRequired') : validateName(name, t);
  const keyError = keyValue === '' ? t('keyRequired') : '';

  if (nameErr !== '' || keyError !== '') {
    return { nameError: nameErr, keyError };
  }

  return null;
}

export function CreateApiKeyDialog({ open, onOpenChange, orgId, onCreated }: CreateApiKeyDialogProps) {
  const t = useTranslations('apiKeys');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <CreateApiKeyForm open={open} onOpenChange={onOpenChange} orgId={orgId} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
