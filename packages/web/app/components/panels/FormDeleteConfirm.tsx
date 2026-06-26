'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

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

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  slug: string;
}

export function FormDeleteConfirm({ open, onClose, onConfirm, slug }: Props): ReactElement {
  const t = useTranslations('forms.delete');
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title', { slug })}</AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2">
            <span>{t('body')}</span>
            <span>{t('slugReuseWarning')}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
