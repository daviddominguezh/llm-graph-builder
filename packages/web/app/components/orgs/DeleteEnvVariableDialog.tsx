'use client';

import { deleteEnvVariableAction } from '@/app/actions/org-env-variables';
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

interface DeleteEnvVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variableId: string;
  variableName: string;
  onDeleted: () => void;
}

function useDeleteEnvVariable(
  variableId: string,
  onOpenChange: (open: boolean) => void,
  onDeleted: () => void
) {
  const t = useTranslations('envVariables');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteEnvVariableAction(variableId);

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

export function DeleteEnvVariableDialog({
  open,
  onOpenChange,
  variableId,
  variableName,
  onDeleted,
}: DeleteEnvVariableDialogProps) {
  const t = useTranslations('envVariables');
  const { loading, handleDelete } = useDeleteEnvVariable(variableId, onOpenChange, onDeleted);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription', { name: variableName })}</AlertDialogDescription>
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
