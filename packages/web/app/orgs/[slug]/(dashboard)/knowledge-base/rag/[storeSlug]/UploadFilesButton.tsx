'use client';

import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

interface UploadFilesButtonProps {
  uploading: boolean;
  onFiles: (files: FileList) => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.html,.jpg,.jpeg,.png';
const KBD_FLASH_MS = 200;
const SHORTCUT_KEY = 'o';

function usePickerShortcut(open: () => void): boolean {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === SHORTCUT_KEY) {
        e.preventDefault();
        open();
        setPressed(true);
        setTimeout(() => setPressed(false), KBD_FLASH_MS);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return pressed;
}

function kbdItemClass(pressed: boolean): string {
  const base = 'bg-transparent transition-colors duration-150';
  return pressed ? `${base} text-primary bg-primary/15` : base;
}

export function UploadFilesButton({ uploading, onFiles }: UploadFilesButtonProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker(): void {
    inputRef.current?.click();
  }

  const kbdPressed = usePickerShortcut(openPicker);
  const kbdClass = kbdItemClass(kbdPressed);

  function onPick(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        className="border-[0.5px] rounded-md gap-2 cursor-pointer"
        disabled={uploading}
        onClick={openPicker}
      >
        {uploading ? t('uploading') : t('upload')}
        <KbdGroup>
          <Kbd className={kbdClass}>⌘ + O</Kbd>
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
    </>
  );
}
