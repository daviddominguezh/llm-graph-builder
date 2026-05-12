'use client';

import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

import { ACCEPTED_EXTENSIONS } from './ragUploadConstants';

interface FileUploadDropzoneProps {
  onFiles: (files: File[]) => void;
}

export function FileUploadDropzone({ onFiles }: FileUploadDropzoneProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(): void {
    setDragging(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(Array.from(e.dataTransfer.files));
  }
  function onPick(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }
  function openPicker(): void {
    inputRef.current?.click();
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-1 min-h-0 flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12 text-xs transition-colors ${
        dragging ? 'bg-input/40 border-primary' : 'border-border'
      }`}
    >
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-sm font-medium">{dragging ? t('drop') : t('idle')}</span>
      <span className="text-[10px] font-mono text-muted-foreground/70">{t('extensions')}</span>
      <Button size="sm" type="button" onClick={openPicker} className="cursor-pointer gap-2">
        {t('upload')}
        <KbdGroup>
          <Kbd className="bg-transparent text-primary-foreground">⌘ + O</Kbd>
        </KbdGroup>
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
