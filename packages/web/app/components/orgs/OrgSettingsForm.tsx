'use client';

import { removeOrgAvatarAction, updateOrgNameAction, uploadOrgAvatarAction } from '@/app/actions/orgs';
import type { OrgRow } from '@/app/lib/orgs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

async function submitNameUpdate(
  orgId: string,
  name: string
): Promise<{ slug: string | null; error: string | null }> {
  const { result: newSlug, error } = await updateOrgNameAction(orgId, name);
  return { slug: newSlug, error };
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
    const { slug: newSlug, error } = await submitNameUpdate(org.id, name);
    setLoading(false);

    if (error !== null) {
      toast.error(error);
      return;
    }

    if (newSlug !== null && newSlug !== org.slug) {
      router.replace(`/orgs/${newSlug}/settings`);
    }
  }

  return { loading, nameError, handleSubmit };
}

function NameSection({ org }: OrgSettingsFormProps) {
  const t = useTranslations('orgs');
  const { loading, nameError, handleSubmit } = useNameSubmit(org);

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 flex-col gap-2">
      <Label htmlFor="org-name">{t('name')}</Label>
      <div className="flex items-center gap-2">
        <Input id="org-name" name="name" defaultValue={org.name} placeholder={t('namePlaceholder')} required />
        <Button type="submit" variant="outline" size="sm" disabled={loading}>
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
  const t = useTranslations('orgs');

  return (
    <Card className='bg-background ring-0'>
      <CardHeader>
        <CardTitle>{t('generalSection')}</CardTitle>
        <CardDescription>{t('generalDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <AvatarSection org={org} />
          <NameSection org={org} />
        </div>
      </CardContent>
    </Card>
  );
}
