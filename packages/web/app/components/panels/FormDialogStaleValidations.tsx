'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

import type { ValidationsMap } from '@daviddh/llm-graph-runner';
import { Button } from '@/components/ui/button';

interface Props {
  stalePaths: string[];
  validations: ValidationsMap;
  onChange: (next: ValidationsMap) => void;
  onKeep: () => void;
  kept: boolean;
}

export function FormDialogStaleValidations({
  stalePaths,
  validations,
  onChange,
  onKeep,
  kept,
}: Props): JSX.Element | null {
  const t = useTranslations('forms.validations.stale');
  if (stalePaths.length === 0 || kept) return null;

  const removeAll = (): void => {
    const next = { ...validations };
    for (const p of stalePaths) {
      delete next[p];
    }
    onChange(next);
  };

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>{t('banner', { count: stalePaths.length })}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={removeAll}>
            {t('remove')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onKeep}>
            {t('keep')}
          </Button>
        </div>
      </div>
    </div>
  );
}
