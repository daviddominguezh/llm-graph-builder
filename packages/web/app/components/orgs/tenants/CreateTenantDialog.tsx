'use client';

import { createTenantAction } from '@/app/actions/tenants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface CreateTenantDialogProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface TenantFormProps {
  orgId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function TenantForm({ orgId, onOpenChange, onCreated }: TenantFormProps) {
  const t = useTranslations('tenants');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();

    if (name === '') return;

    setLoading(true);
    const { error } = await createTenantAction(orgId, name);
    setLoading(false);

    if (error !== null) {
      toast.error(t('createError'));
      return;
    }

    onOpenChange(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="tenant-name">{t('name')}</Label>
        <Input id="tenant-name" name="name" autoComplete="off" placeholder={t('namePlaceholder')} required />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('add')}
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
