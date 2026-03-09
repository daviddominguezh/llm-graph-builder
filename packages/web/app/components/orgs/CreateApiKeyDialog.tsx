'use client';

import { createApiKey } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onCreated: () => void;
}

interface CreateApiKeyFieldsProps {
  nameError: string;
  keyError: string;
}

function CreateApiKeyFields({ nameError, keyError }: CreateApiKeyFieldsProps) {
  const t = useTranslations('apiKeys');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="key-name">{t('name')}</Label>
        <Input id="key-name" name="name" placeholder={t('namePlaceholder')} required />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="key-value">{t('key')}</Label>
        <Input id="key-value" name="keyValue" placeholder={t('keyPlaceholder')} required />
        {keyError !== '' && <p className="text-destructive text-xs">{keyError}</p>}
      </div>
    </>
  );
}

function CreateApiKeyForm({ orgId, onOpenChange, onCreated }: CreateApiKeyDialogProps) {
  const t = useTranslations('apiKeys');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [keyError, setKeyError] = useState('');

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

    const supabase = createClient();
    const { result, error } = await createApiKey(supabase, orgId, name, keyValue);

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
      <CreateApiKeyFields nameError={nameError} keyError={keyError} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface FieldErrors {
  nameError: string;
  keyError: string;
}

function validateFields(
  name: string,
  keyValue: string,
  t: (key: string) => string
): FieldErrors | null {
  const nameError = name === '' ? t('nameRequired') : '';
  const keyError = keyValue === '' ? t('keyRequired') : '';

  if (nameError !== '' || keyError !== '') {
    return { nameError, keyError };
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
