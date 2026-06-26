'use client';

import { createTenantAction, uploadTenantAvatarAction } from '@/app/actions/tenants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AvatarUpload } from '../AvatarUpload';

interface CreateTenantDialogProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

async function submitTenant(orgId: string, name: string, file: File | null): Promise<void> {
  const { result: tenant, error } = await createTenantAction(orgId, name);

  if (error !== null || tenant === null) {
    throw new Error(error ?? 'Failed to create tenant');
  }

  if (file !== null) {
    const formData = new FormData();
    formData.append('file', file);
    const uploadResult = await uploadTenantAvatarAction(tenant.id, formData);
    if (uploadResult.error !== null) {
      console.error('[submitTenant] avatar upload failed:', uploadResult.error);
    }
  }
}

function TenantForm({
  orgId,
  onOpenChange,
  onCreated,
}: {
  orgId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('tenants');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);

  function handleFileSelect(file: File | null) {
    fileRef.current = file;
    setPreviewUrl(file !== null ? URL.createObjectURL(file) : null);
  }

  function handleRemove() {
    fileRef.current = null;
    setPreviewUrl(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;

    setLoading(true);
    try {
      await submitTenant(orgId, trimmed, fileRef.current);
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error(t('createError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <AvatarUpload
          currentUrl={null}
          previewUrl={previewUrl}
          name={name}
          onFileSelect={handleFileSelect}
          onRemove={previewUrl !== null ? handleRemove : undefined}
        />
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="tenant-name">{t('name')}</Label>
          <Input
            id="tenant-name"
            name="name"
            autoComplete="off"
            placeholder={t('namePlaceholder')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading || name.trim() === ''}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateTenantDialog({ orgId, open, onOpenChange, onCreated }: CreateTenantDialogProps) {
  const t = useTranslations('tenants');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
        </DialogHeader>
        <TenantForm orgId={orgId} onOpenChange={onOpenChange} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
