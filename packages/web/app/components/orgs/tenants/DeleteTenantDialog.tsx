'use client';

import { deleteTenantAction } from '@/app/actions/tenants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface DeleteTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  onDeleted: () => void;
}

function useDeleteTenant(tenantId: string, onOpenChange: (open: boolean) => void, onDeleted: () => void) {
  const t = useTranslations('tenants');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteTenantAction(tenantId);
    setLoading(false);

    if (error !== null) {
      toast.error(t('deleteError'));
      return;
    }

    onOpenChange(false);
    onDeleted();
  }

  return { loading, handleDelete };
}

export function DeleteTenantDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onDeleted,
}: DeleteTenantDialogProps) {
  const t = useTranslations('tenants');
  const { loading, handleDelete } = useDeleteTenant(tenantId, onOpenChange, onDeleted);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription', { name: tenantName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
