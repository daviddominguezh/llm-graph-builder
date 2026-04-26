'use client';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';

import { AddFilesButton } from './AddFilesButton';
import { FileList } from './FileList';
import { KnowledgeBaseEmptyState } from './KnowledgeBaseEmptyState';
import { UploaderFooter } from './UploaderFooter';
import { ACCEPT_ATTR } from './uploaderHelpers';
import type { FileQueue } from './useFileQueue';

function usePickerShortcut(inputRef: RefObject<HTMLInputElement | null>): boolean {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        inputRef.current?.click();
        setPressed(true);
        setTimeout(() => {
          setPressed(false);
        }, 200);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [inputRef]);
  return pressed;
}

interface UploaderCardHeaderProps {
  count: number;
  onAdd: () => void;
  kbdPressed: boolean;
}

function UploaderCardHeader({
  count,
  onAdd,
  kbdPressed,
}: UploaderCardHeaderProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <CardHeader>
      <CardTitle className="flex items-center">
        {t('title')}
        {count > 0 && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">{count}</span>
        )}
      </CardTitle>
      <CardDescription>{t('description')}</CardDescription>
      <CardAction>
        <AddFilesButton onAdd={onAdd} kbdPressed={kbdPressed} />
      </CardAction>
    </CardHeader>
  );
}

interface KnowledgeBaseUploaderProps {
  queue: FileQueue;
  isDragging: boolean;
}

export function KnowledgeBaseUploader({
  queue,
  isDragging,
}: KnowledgeBaseUploaderProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const kbdPressed = usePickerShortcut(inputRef);

  function open() {
    inputRef.current?.click();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files !== null && e.target.files.length > 0) {
      queue.add(e.target.files);
      e.target.value = '';
    }
  }

  const isEmpty = queue.files.length === 0;
  const cardClass = isEmpty ? 'bg-background ring-0 flex flex-1 flex-col' : 'bg-background ring-0';
  const contentClass = isEmpty ? 'flex flex-1 flex-col gap-4' : 'flex flex-col gap-4';
  return (
    <Card className={cardClass}>
      <UploaderCardHeader count={queue.files.length} onAdd={open} kbdPressed={kbdPressed} />
      <CardContent className={contentClass}>
        {isEmpty ? (
          <KnowledgeBaseEmptyState isDragging={isDragging} onAdd={open} />
        ) : (
          <FileList files={queue.files} onRemove={queue.remove} />
        )}
        {!isEmpty && <UploaderFooter files={queue.files} onClear={queue.clear} />}
      </CardContent>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={handleChange}
        className="hidden"
      />
    </Card>
  );
}
