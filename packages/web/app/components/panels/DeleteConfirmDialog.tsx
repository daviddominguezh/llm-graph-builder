'use client';

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

import type { PendingDeleteTarget } from '../../hooks/useDeleteConfirmation';

interface DeleteConfirmDialogProps {
  pendingDelete: PendingDeleteTarget | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ pendingDelete, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const t = useTranslations('editor');
  const isNode = pendingDelete?.kind === 'node';

  return (
    <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isNode ? t('deleteNodeTitle') : t('deleteEdgeTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {isNode ? t('deleteNodeDescription') : t('deleteEdgeDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
