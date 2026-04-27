'use client';

import { type RefObject, useEffect, useState } from 'react';

function attachDragHandlers(
  el: HTMLElement,
  setIsDragging: (v: boolean) => void,
  onFiles: (files: FileList) => void
): () => void {
  let counter = 0;

  const onEnter = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    counter++;
    setIsDragging(true);
  };
  const onLeave = (e: DragEvent) => {
    e.preventDefault();
    counter = Math.max(0, counter - 1);
    if (counter === 0) setIsDragging(false);
  };
  const onOver = (e: DragEvent) => {
    e.preventDefault();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    counter = 0;
    setIsDragging(false);
    if (e.dataTransfer !== null && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files);
    }
  };

  el.addEventListener('dragenter', onEnter);
  el.addEventListener('dragleave', onLeave);
  el.addEventListener('dragover', onOver);
  el.addEventListener('drop', onDrop);

  return () => {
    el.removeEventListener('dragenter', onEnter);
    el.removeEventListener('dragleave', onLeave);
    el.removeEventListener('dragover', onOver);
    el.removeEventListener('drop', onDrop);
  };
}

export function useNativeDropArea<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onFiles: (files: FileList) => void
): boolean {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    return attachDragHandlers(el, setIsDragging, onFiles);
  }, [ref, onFiles]);

  return isDragging;
}
