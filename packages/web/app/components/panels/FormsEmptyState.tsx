'use client';

import { FileText, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface Props {
  mode: 'no-schemas' | 'no-forms';
  onCreateSchema?: () => void;
  onCreateForm?: () => void;
}

export function FormsEmptyState({ mode, onCreateSchema, onCreateForm }: Props) {
  const t = useTranslations('forms.empty');
  const key = mode === 'no-schemas' ? 'noSchemas' : 'noForms';
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <FileText className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t(`${key}.title`)}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t(`${key}.description`)}</p>
      </div>
      {mode === 'no-schemas' && onCreateSchema !== undefined && (
        <Button size="sm" className="rounded-full" onClick={onCreateSchema}>
          <Plus className="size-3.5" />
          {t('noSchemas.cta')}
        </Button>
      )}
      {mode === 'no-forms' && onCreateForm !== undefined && (
        <Button size="sm" className="rounded-full" onClick={onCreateForm}>
          <Plus className="size-3.5" />
          {t('noForms.cta')}
        </Button>
      )}
    </div>
  );
}
