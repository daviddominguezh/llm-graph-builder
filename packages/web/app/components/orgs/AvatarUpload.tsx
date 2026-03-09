'use client';

import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { type ChangeEvent, useRef } from 'react';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.webp';

interface AvatarUploadProps {
  currentUrl: string | null;
  previewUrl: string | null;
  name: string;
  onFileSelect: (file: File | null) => void;
  onRemove?: () => void;
}

function AvatarFallback({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="bg-muted text-muted-foreground flex size-20 items-center justify-center rounded-full text-2xl font-semibold">
      {letter}
    </div>
  );
}

function AvatarImage({ src, name }: { src: string; name: string }) {
  return (
    <Image
      src={src}
      alt={name}
      width={80}
      height={80}
      className="size-20 rounded-full object-cover"
    />
  );
}

function AvatarPreview({ currentUrl, previewUrl, name }: Pick<AvatarUploadProps, 'currentUrl' | 'previewUrl' | 'name'>) {
  const displayUrl = previewUrl ?? currentUrl;

  if (displayUrl !== null) {
    return <AvatarImage src={displayUrl} name={name} />;
  }

  return <AvatarFallback name={name} />;
}

function useFileHandler(onFileSelect: (file: File | null) => void) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    if (file !== null && file.size > MAX_FILE_SIZE) {
      onFileSelect(null);
      return;
    }

    onFileSelect(file);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return { inputRef, handleChange, openPicker };
}

function AvatarActions({
  currentUrl,
  onRemove,
  onUploadClick,
}: {
  currentUrl: string | null;
  onRemove: (() => void) | undefined;
  onUploadClick: () => void;
}) {
  const t = useTranslations('orgs');
  const showRemove = currentUrl !== null && onRemove !== undefined;

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onUploadClick}>
        <Upload data-icon="inline-start" />
        {t('upload')}
      </Button>
      {showRemove && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('remove')}
        </Button>
      )}
    </div>
  );
}

export function AvatarUpload({ currentUrl, previewUrl, name, onFileSelect, onRemove }: AvatarUploadProps) {
  const t = useTranslations('orgs');
  const { inputRef, handleChange, openPicker } = useFileHandler(onFileSelect);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t('profilePicture')}</span>
      <div className="flex items-center gap-4">
        <AvatarPreview currentUrl={currentUrl} previewUrl={previewUrl} name={name} />
        <AvatarActions currentUrl={currentUrl} onRemove={onRemove} onUploadClick={openPicker} />
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleChange} />
    </div>
  );
}
