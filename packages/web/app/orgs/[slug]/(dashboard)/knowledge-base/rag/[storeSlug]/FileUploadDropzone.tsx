'use client';

import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

interface FileUploadDropzoneProps {
  uploading: boolean;
  onFiles: (files: FileList) => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.html,.jpg,.jpeg,.png';

export function FileUploadDropzone({
  uploading,
  onFiles,
}: FileUploadDropzoneProps): React.JSX.Element {
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
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  }
  function onPick(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(e.target.files);
      e.target.value = '';
    }
  }
  function onPickClick(): void {
    inputRef.current?.click();
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-8 text-xs transition-colors ${
        dragging ? 'bg-input/40 border-primary' : 'border-border'
      }`}
    >
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-muted-foreground">{dragging ? t('drop') : t('idle')}</span>
      <span className="text-[10px] font-mono text-muted-foreground/70">{t('extensions')}</span>
      <Button size="sm" variant="outline" disabled={uploading} onClick={onPickClick}>
        {uploading ? t('uploading') : t('addFiles')}
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
