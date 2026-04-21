'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

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

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteConfirmed = useCallback(() => {
    setConfirmOpen(false);
    onDelete(sortOrder);
  }, [sortOrder, onDelete]);

  return (
    <div className="group relative flex items-center gap-1.5 p-1 px-0 animate-in fade-in slide-in-from-top-1 duration-200">
      <span className="cursor-default flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-medium text-primary/70 bg-primary/10">
        {sortOrder + 1}
      </span>
      <div className="w-0.5 h-full py-0.5 ml-0.5"><div className='w-full h-full'></div></div>
      <TextareaAutosize
        defaultValue={content}
        onChange={handleChange}
        placeholder={t('contextItemPlaceholder')}
        minRows={1}
        className="flex-1 resize-none rounded-md border bg-transparent px-0 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none border-none ring-0 outline-none"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setConfirmOpen(true)}
        aria-label={t('removeContextItem')}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteContextItem')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteContextItemDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteContextItemCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirmed}>
              {t('deleteContextItemConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
