'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

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

function EmptyState({ message }: { message: string }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{message}</p>;
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
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAdd}>
          <Plus className="mr-1 size-3" />
          {t('addContextItem')}
        </Button>
      </div>
      {items.length === 0 && <EmptyState message={t('emptyContextItems')} />}
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <ContextItemRow
            key={`${String(item.sortOrder)}-${item.content.slice(0, 10)}`}
            sortOrder={item.sortOrder}
            content={item.content}
            onContentChange={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
