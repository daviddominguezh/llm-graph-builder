'use client';

import {
  removeTenantAvatarAction,
  updateTenantAction,
  uploadTenantAvatarAction,
} from '@/app/actions/tenants';
import { AvatarUpload } from '@/app/components/orgs/AvatarUpload';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface TenantSettingsFormProps {
  tenant: TenantRow;
  orgSlug: string;
}

function useNameSubmit(tenant: TenantRow, orgSlug: string) {
  const t = useTranslations('tenants');
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
    const { result, error } = await updateTenantAction(tenant.id, name);
    setLoading(false);

    if (error !== null) {
      toast.error(t('updateError'));
      return;
    }

    if (result !== null && result.slug !== tenant.slug) {
      router.replace(`/orgs/${orgSlug}/tenant/${result.slug}`);
      return;
    }

    router.refresh();
  }

  return { loading, nameError, handleSubmit };
}

function NameField({ tenant, orgSlug }: TenantSettingsFormProps) {
  const t = useTranslations('tenants');
  const { loading, nameError, handleSubmit } = useNameSubmit(tenant, orgSlug);

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 flex-col gap-2">
      <Label htmlFor="tenant-name">{t('name')}</Label>
      <div className="flex items-center gap-2">
        <Input id="tenant-name" name="name" defaultValue={tenant.name} required />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="border-[0.5px] rounded-md"
          disabled={loading}
        >
          {t('save')}
        </Button>
      </div>
      {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
    </form>
  );
}

function useAvatarHandlers(tenant: TenantRow) {
  const t = useTranslations('tenants');
  const router = useRouter();

  async function onFileSelect(file: File | null) {
    if (file === null) return;
    const formData = new FormData();
    formData.append('file', file);
    const { error } = await uploadTenantAvatarAction(tenant.id, formData);

    if (error !== null) {
      toast.error(t('uploadError'));
      return;
    }

    router.refresh();
  }

  async function onRemove() {
    const { error } = await removeTenantAvatarAction(tenant.id);

    if (error !== null) {
      toast.error(t('uploadError'));
      return;
    }

    router.refresh();
  }

  return { onFileSelect, onRemove };
}

function AvatarField({ tenant }: { tenant: TenantRow }) {
  const { onFileSelect, onRemove } = useAvatarHandlers(tenant);

  return (
    <AvatarUpload
      currentUrl={tenant.avatar_url}
      previewUrl={null}
      name={tenant.name}
      onFileSelect={onFileSelect}
      onRemove={onRemove}
    />
  );
}

export function TenantSettingsForm({ tenant, orgSlug }: TenantSettingsFormProps) {
  const t = useTranslations('tenants');

  return (
    <Card className="bg-transparent ring-0 border-transparent">
      <CardHeader>
        <CardTitle>{t('generalSection')}</CardTitle>
        <CardDescription>{t('generalDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <AvatarField tenant={tenant} />
          <NameField tenant={tenant} orgSlug={orgSlug} />
        </div>
      </CardContent>
    </Card>
  );
}
