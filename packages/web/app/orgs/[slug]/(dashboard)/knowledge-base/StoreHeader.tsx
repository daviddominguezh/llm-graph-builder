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
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StoreHeaderProps {
  name: string;
  slug: string;
  onDelete: () => Promise<void>;
}

export function StoreHeader({ name, slug, onDelete }: StoreHeaderProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    setConfirmOpen(false);
  }

  return (
    <div className="flex items-center justify-between border-b pb-3">
      <div className="flex gap-1 items-center">
        <h1 className="text-base font-semibold">{name}</h1>
        <span className="font-mono text-[11px] text-muted-foreground">{'(' + slug + ')'}</span>
      </div>
      <Button
        variant="destructive"
        size="icon"
        aria-label={t('storeHeader.delete')}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleConfirm}>
              {t('delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
