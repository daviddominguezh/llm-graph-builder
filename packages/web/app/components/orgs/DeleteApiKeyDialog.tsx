'use client';

import { deleteApiKeyAction } from '@/app/actions/api-keys';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface DeleteApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string;
  keyName: string;
  onDeleted: () => void;
}

function useDeleteApiKey(keyId: string, onOpenChange: (open: boolean) => void, onDeleted: () => void) {
  const t = useTranslations('apiKeys');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteApiKeyAction(keyId);

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

export function DeleteApiKeyDialog({ open, onOpenChange, keyId, keyName, onDeleted }: DeleteApiKeyDialogProps) {
  const t = useTranslations('apiKeys');
  const { loading, handleDelete } = useDeleteApiKey(keyId, onOpenChange, onDeleted);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription', { name: keyName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
