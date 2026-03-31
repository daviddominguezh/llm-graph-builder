'use client';

import { updateTenantAction } from '@/app/actions/tenants';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface EditTenantDialogProps {
  tenant: TenantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditForm({ tenant, onOpenChange, onSaved }: Omit<EditTenantDialogProps, 'open'>) {
  const t = useTranslations('tenants');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();

    if (name === '') return;

    setLoading(true);
    const { error } = await updateTenantAction(tenant.id, name);
    setLoading(false);

    if (error !== null) {
      toast.error(t('updateError'));
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-tenant-name">{t('name')}</Label>
        <Input id="edit-tenant-name" name="name" defaultValue={tenant.name} required />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('save')}
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
