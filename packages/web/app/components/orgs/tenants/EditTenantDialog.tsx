'use client';

import { removeTenantAvatarAction, updateTenantAction, uploadTenantAvatarAction } from '@/app/actions/tenants';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AvatarUpload } from '../AvatarUpload';

interface EditTenantDialogProps {
  tenant: TenantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditForm({ tenant, onOpenChange, onSaved }: Omit<EditTenantDialogProps, 'open'>) {
  const t = useTranslations('tenants');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(tenant.name);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const [pendingRemove, setPendingRemove] = useState(false);

  function handleFileSelect(file: File | null) {
    fileRef.current = file;
    setPreviewUrl(file !== null ? URL.createObjectURL(file) : null);
    setPendingRemove(false);
  }

  function handleRemove() {
    fileRef.current = null;
    setPreviewUrl(null);
    setPendingRemove(true);
  }

  const currentUrl = pendingRemove ? null : tenant.avatar_url;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;

    setLoading(true);
    try {
      const { error } = await updateTenantAction(tenant.id, trimmed);
      if (error !== null) {
        toast.error(t('updateError'));
        setLoading(false);
        return;
      }

      if (fileRef.current !== null) {
        const formData = new FormData();
        formData.append('file', fileRef.current);
        await uploadTenantAvatarAction(tenant.id, formData);
      } else if (pendingRemove && tenant.avatar_url !== null) {
        await removeTenantAvatarAction(tenant.id);
      }

      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(t('updateError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <AvatarUpload
          currentUrl={currentUrl}
          previewUrl={previewUrl}
          name={name}
          onFileSelect={handleFileSelect}
          onRemove={(previewUrl ?? currentUrl) !== null ? handleRemove : undefined}
        />
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="edit-tenant-name">{t('name')}</Label>
          <Input
            id="edit-tenant-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading || name.trim() === ''}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTenantDialog({ tenant, open, onOpenChange, onSaved }: EditTenantDialogProps) {
  const t = useTranslations('tenants');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        <EditForm tenant={tenant} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
