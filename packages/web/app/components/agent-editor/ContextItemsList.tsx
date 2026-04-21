'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import React from 'react';

import { ContextItemRow } from './ContextItemRow';

interface ContextItem {
  sortOrder: number;
  content: string;
}

interface ContextItemsListProps {
  items: ContextItem[];
  onInsert: (sortOrder: number, content: string) => void;
  onUpdate: (sortOrder: number, content: string) => void;
  onDelete: (sortOrder: number) => void;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-ring/50 border-dashed rounded-md flex flex-col items-center gap-2 py-6 text-center bg-background dark:bg-input/30">
      <MessageSquare className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="max-w-xs text-[11px] text-muted-foreground/70">{description}</p>
    </div>
  );
}

export function ContextItemsList({ items, onInsert, onUpdate, onDelete }: ContextItemsListProps) {
  const t = useTranslations('agentEditor');

  const handleAdd = useCallback(() => {
    const nextOrder = items.length;
    onInsert(nextOrder, '');
  }, [items.length, onInsert]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{t('contextItems')}</Label>
        <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={handleAdd}>
          <Plus className="mr-1 size-3" />
          {t('addContextItem')}
        </Button>
      </div>
      {items.length === 0 && (
        <EmptyState title={t('emptyContextItems')} description={t('contextItemsDescription')} />
      )}
      <div className="flex flex-col gap-1.5 pl-4 border-l-2 border-accent/20">
        {items.map((item, i) => (
          <React.Fragment key={`${String(item.sortOrder)}-${item.content.slice(0, 10)}`}>
            <ContextItemRow
              key={`${String(item.sortOrder)}-${item.content.slice(0, 10)}`}
              sortOrder={item.sortOrder}
              content={item.content}
              onContentChange={onUpdate}
              onDelete={onDelete}
            />
            {i < items.length - 1 && <Separator className="ml-7 max-w-[calc(100%-var(--spacing)*7)]" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
