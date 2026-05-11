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

export type StoreType = 'rag' | 'kv';

interface CreateStoreDialogProps {
  type: StoreType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<{ ok: boolean; slug?: string; requestedSlug?: string }>;
}

export function CreateStoreDialog({
  type,
  open,
  onOpenChange,
  onCreate,
}: CreateStoreDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.create');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewedSlug = previewStoreSlug(name);
  const title = type === 'rag' ? t('titleRag') : t('titleKv');
  const slugLine = previewedSlug === '' ? t('slugFallback') : t('slugPreview', { slug: previewedSlug });

  async function handleSubmit() {
    if (name.trim() === '' || submitting) return;
    setSubmitting(true);
    const res = await onCreate(name.trim());
    setSubmitting(false);
    if (res.ok) {
      setName('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{slugLine}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="store-name">{t('nameLabel')}</Label>
          <Input
            id="store-name"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={name.trim() === '' || submitting}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
