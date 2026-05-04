'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FormRef {
  id: string;
  slug: string;
}

interface OutputSchemaDeleteBlockedDialogProps {
  open: boolean;
  onClose: () => void;
  forms: FormRef[];
  editFormHref: (formId: string) => string;
}

export function OutputSchemaDeleteBlockedDialog({
  open,
  onClose,
  forms,
  editFormHref,
}: OutputSchemaDeleteBlockedDialogProps): ReactNode {
  const t = useTranslations('outputSchemas.warnings.deleteBlocked');

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">{t('body', { count: forms.length })}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={editFormHref(f.id)} className="text-primary underline">
                {f.slug}
              </Link>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
