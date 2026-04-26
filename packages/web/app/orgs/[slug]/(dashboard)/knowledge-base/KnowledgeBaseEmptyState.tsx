'use client';

import { Button } from '@/components/ui/button';
import { FileText, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface KnowledgeBaseEmptyStateProps {
  isDragging: boolean;
  onAdd: () => void;
}

function containerClassName(isDragging: boolean): string {
  const base =
    'flex w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background px-4 py-8 text-center transition-colors duration-150';
  const drag = isDragging ? 'border-primary/60 bg-primary/[0.02]' : '';
  return `${base} ${drag}`.trim();
}

function chipClassName(isDragging: boolean): string {
  const base =
    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150';
  return `${base} ${isDragging ? 'bg-primary/10' : 'bg-muted'}`;
}

function iconClassName(isDragging: boolean): string {
  const base = 'size-5 transition-colors duration-150';
  return `${base} ${isDragging ? 'text-primary' : 'text-muted-foreground'}`;
}

function titleClassName(isDragging: boolean): string {
  const base = 'text-sm font-medium transition-colors duration-150';
  return `${base} ${isDragging ? 'text-primary' : ''}`;
}

export function KnowledgeBaseEmptyState({
  isDragging,
  onAdd,
}: KnowledgeBaseEmptyStateProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <div className={containerClassName(isDragging)}>
      <div className={chipClassName(isDragging)}>
        <FileText className={iconClassName(isDragging)} />
      </div>
      <div className="flex flex-col gap-1">
        <p className={titleClassName(isDragging)}>
          {isDragging ? t('dropToAdd') : t('emptyTitle')}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">{t('emptyDescription')}</p>
        <p className="font-mono text-[11px] text-muted-foreground/70 mt-1">{t('extensions')}</p>
      </div>
      <Button size="sm" className="rounded-full" onClick={onAdd}>
        <Plus className="size-3.5" />
        {t('addFiles')}
      </Button>
    </div>
  );
}
