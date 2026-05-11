'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface RenameStoreDialogProps {
  open: boolean;
  currentName: string;
  currentSlug: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newName: string) => Promise<{ ok: boolean }>;
}

export function RenameStoreDialog(props: RenameStoreDialogProps): React.JSX.Element | null {
  if (!props.open) return null;
  return <RenameStoreDialogInner {...props} key={props.currentSlug} />;
}

function RenameStoreDialogInner({
  open,
  currentName,
  currentSlug,
  onOpenChange,
  onSubmit,
}: RenameStoreDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.rename');
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed !== '' && trimmed !== currentName && !submitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    const { ok } = await onSubmit(trimmed);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="rename-store-name">{t('nameLabel')}</Label>
          <Input
            id="rename-store-name"
            className="mt-1"
            value={name}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <span className="ml-[calc(0px+var(--spacing)*2)] text-[11px] text-muted-foreground">
            {t('slugUnchanged', { slug: currentSlug })}
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
