'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface ContextItemRowProps {
  sortOrder: number;
  content: string;
  onContentChange: (sortOrder: number, content: string) => void;
  onDelete: (sortOrder: number) => void;
}

export function ContextItemRow({ sortOrder, content, onContentChange, onDelete }: ContextItemRowProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onContentChange(sortOrder, text), DEBOUNCE_MS);
    },
    [sortOrder, onContentChange]
  );

  const handleDelete = useCallback(() => {
    onDelete(sortOrder);
  }, [sortOrder, onDelete]);

  return (
    <div className="group flex items-start gap-1.5 rounded-md border p-2 animate-in fade-in slide-in-from-top-1 duration-200">
      <span className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-medium text-primary/70 bg-primary/10">
        {sortOrder + 1}
      </span>
      <Textarea
        defaultValue={content}
        onChange={handleChange}
        placeholder={t('contextItemPlaceholder')}
        className="min-h-16 flex-1 resize-y text-sm"
      />
      <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0" onClick={handleDelete} aria-label={t('removeContextItem')}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
