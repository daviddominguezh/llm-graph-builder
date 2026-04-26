'use client';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';

import { AddFilesButton } from './AddFilesButton';
import { FileList } from './FileList';
import { KnowledgeBaseEmptyState } from './KnowledgeBaseEmptyState';
import { KvStorePlaceholder } from './KvStorePlaceholder';
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

  return (
    <Card className="bg-background ring-0 flex flex-1 flex-col">
      <UploaderCardHeader count={queue.files.length} onAdd={open} kbdPressed={kbdPressed} />
      <CardContent className="flex flex-1 flex-col">
        <UploaderTabs
          isEmpty={queue.files.length === 0}
          isDragging={isDragging}
          onAdd={open}
          files={queue.files}
          onRemove={queue.remove}
          onClear={queue.clear}
        />
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

interface UploaderTabsProps {
  isEmpty: boolean;
  isDragging: boolean;
  onAdd: () => void;
  files: FileQueue['files'];
  onRemove: (id: string) => void;
  onClear: () => void;
}

function UploaderTabs({
  isEmpty,
  isDragging,
  onAdd,
  files,
  onRemove,
  onClear,
}: UploaderTabsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <Tabs defaultValue="rag" className="flex flex-1 flex-col">
      <TabsList variant="line">
        <TabsTrigger value="rag">{t('tabRag')}</TabsTrigger>
        <TabsTrigger value="kv">{t('tabKv')}</TabsTrigger>
      </TabsList>
      <TabsContent value="rag" className="flex flex-col gap-4">
        {isEmpty ? (
          <KnowledgeBaseEmptyState isDragging={isDragging} onAdd={onAdd} />
        ) : (
          <FileList files={files} onRemove={onRemove} />
        )}
        {!isEmpty && <UploaderFooter files={files} onClear={onClear} />}
      </TabsContent>
      <TabsContent value="kv" className="flex flex-col">
        <KvStorePlaceholder />
      </TabsContent>
    </Tabs>
  );
}
