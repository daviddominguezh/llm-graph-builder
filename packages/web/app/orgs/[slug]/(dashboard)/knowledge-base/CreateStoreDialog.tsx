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
import { previewStoreSlug } from '@/app/lib/slugPreview';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { StoreTypeCards } from './StoreTypeCards';

export type StoreType = 'rag' | 'kv';

interface CreateStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (type: StoreType, name: string) => Promise<{ ok: boolean; slug?: string }>;
}

export function CreateStoreDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateStoreDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.create');
  const [type, setType] = useState<StoreType | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewedSlug = previewStoreSlug(name);
  const canSubmit = type !== null && name.trim() !== '' && !submitting;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('');
      setType(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!canSubmit || type === null) return;
    setSubmitting(true);
    const res = await onCreate(type, name.trim());
    setSubmitting(false);
    if (res.ok) handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('typeLabel')}</Label>
            <StoreTypeCards value={type} onChange={setType} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="store-name">{t('nameLabel')}</Label>
            <Input
              id="store-name"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              {previewedSlug === '' ? ' ' : previewedSlug}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
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
