'use client';

import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';

import { EmptyHint, FileList } from './FileList';
import { UploaderFooter } from './UploaderFooter';
import { UploaderHeader } from './UploaderHeader';
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
        setTimeout(() => { setPressed(false); }, 200);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [inputRef]);
  return pressed;
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
  return (
    <div className="flex flex-col gap-5">
      <UploaderHeader onAdd={open} kbdPressed={kbdPressed} />
      {isEmpty ? (
        <EmptyHint isDragging={isDragging} />
      ) : (
        <FileList files={queue.files} onRemove={queue.remove} />
      )}
      {!isEmpty && <UploaderFooter files={queue.files} onClear={queue.clear} />}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
