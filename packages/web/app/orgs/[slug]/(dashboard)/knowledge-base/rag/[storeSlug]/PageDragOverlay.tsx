'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type DragEvent, useCallback, useRef, useState } from 'react';

export interface PageDragHandlers {
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

interface UsePageDragInput {
  skip: boolean;
  onFiles: (files: File[]) => void;
}

interface UsePageDragReturn {
  isDragging: boolean;
  handlers: PageDragHandlers;
}

const FIRST_DRAG = 1;
const ZERO = 0;

export function usePageDrag({ skip, onFiles }: UsePageDragInput): UsePageDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(ZERO);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (skip) return;
      e.preventDefault();
      dragCounter.current += FIRST_DRAG;
      if (dragCounter.current === FIRST_DRAG) setIsDragging(true);
    },
    [skip]
  );

  const onDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (skip) return;
      e.preventDefault();
      dragCounter.current -= FIRST_DRAG;
      if (dragCounter.current <= ZERO) {
        dragCounter.current = ZERO;
        setIsDragging(false);
      }
    },
    [skip]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      dragCounter.current = ZERO;
      setIsDragging(false);
      if (skip) return;
      if (e.dataTransfer.files.length === ZERO) return;
      onFiles(Array.from(e.dataTransfer.files));
    },
    [onFiles, skip]
  );

  return {
    isDragging,
    handlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}

export function PageDragOverlay(): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  return (
    <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/90">
      <div className="flex flex-col items-center gap-2">
        <Upload className="size-8 text-primary" />
        <span className="text-sm font-medium">{t('pageDropOverlay')}</span>
      </div>
    </div>
  );
}
