'use client';

import { removeOrgAvatarAction, updateOrgNameAction, uploadOrgAvatarAction } from '@/app/actions/orgs';
import type { OrgRow } from '@/app/lib/orgs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { AvatarUpload } from './AvatarUpload';

interface OrgSettingsFormProps {
  org: OrgRow;
}

async function submitNameUpdate(orgId: string, name: string): Promise<string | null> {
  const { result: newSlug, error } = await updateOrgNameAction(orgId, name);

  if (error !== null) return null;
  return newSlug;
}

function useNameSubmit(org: OrgRow) {
  const t = useTranslations('orgs');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();

    if (name === '') {
      setNameError(t('nameRequired'));
      return;
    }

    setLoading(true);
    setNameError('');
    const newSlug = await submitNameUpdate(org.id, name);
    setLoading(false);

    if (newSlug === null) {
      toast.error(t('updateError'));
      return;
    }

    if (newSlug !== org.slug) {
      router.replace(`/orgs/${newSlug}/settings`);
    }
  }

  return { loading, nameError, handleSubmit };
}

function NameSection({ org }: OrgSettingsFormProps) {
  const t = useTranslations('orgs');
  const { loading, nameError, handleSubmit } = useNameSubmit(org);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="org-name">{t('name')}</Label>
      <div className="flex items-end gap-2">
        <Input id="org-name" name="name" defaultValue={org.name} placeholder={t('namePlaceholder')} required />
        <Button type="submit" disabled={loading}>
          {t('saveName')}
        </Button>
      </div>
      {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
    </form>
  );
}

async function handleUpload(orgId: string, file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  const { error } = await uploadOrgAvatarAction(orgId, formData);
  return error;
}

async function handleRemove(orgId: string): Promise<string | null> {
  const { error } = await removeOrgAvatarAction(orgId);
  return error;
}

function useAvatarHandlers(org: OrgRow) {
  const t = useTranslations('orgs');
  const router = useRouter();

  async function onFileSelect(file: File | null) {
    if (file === null) return;
    const error = await handleUpload(org.id, file);

    if (error !== null) {
      toast.error(t('uploadError'));
      return;
    }

    router.refresh();
  }

  async function onRemove() {
    const error = await handleRemove(org.id);

    if (error !== null) {
      toast.error(t('uploadError'));
      return;
    }

    router.refresh();
  }

  return { onFileSelect, onRemove };
}

function AvatarSection({ org }: OrgSettingsFormProps) {
  const { onFileSelect, onRemove } = useAvatarHandlers(org);

  return (
    <AvatarUpload
      currentUrl={org.avatar_url}
      previewUrl={null}
      name={org.name}
      onFileSelect={onFileSelect}
      onRemove={onRemove}
    />
  );
}

export function OrgSettingsForm({ org }: OrgSettingsFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <NameSection org={org} />
      <AvatarSection org={org} />
    </div>
  );
}
