'use client';

import { toProxyImageSrc } from '@/app/lib/supabase/image';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
    <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full text-base font-semibold">
      {letter}
    </div>
  );
}

function AvatarImage({ src, name }: { src: string; name: string }) {
  return (
    <Image
      src={toProxyImageSrc(src)}
      alt={name}
      width={48}
      height={48}
      className="size-12 rounded-full object-cover border"
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

function useFileHandler(onFileSelect: (file: File | null) => void, t: ReturnType<typeof useTranslations>) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    if (file !== null && file.size > MAX_FILE_SIZE) {
      toast.error(t('fileTooLarge'));
      e.target.value = '';
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

export function AvatarUpload({ currentUrl, previewUrl, name, onFileSelect, onRemove }: AvatarUploadProps) {
  const t = useTranslations('orgs');
  const { inputRef, handleChange, openPicker } = useFileHandler(onFileSelect, t);
  const hasImage = (previewUrl ?? currentUrl) !== null;

  return (
    <div className="flex shrink-0 flex-col items-center gap-0 h-fit">
      <Button variant="ghost" type="button" onClick={openPicker} className="mt-1 group relative cursor-pointer rounded-full p-0 h-fit">
        <AvatarPreview currentUrl={currentUrl} previewUrl={previewUrl} name={name} />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
          <Camera className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </Button>
      {hasImage && onRemove !== undefined && (
        <Button variant="link" type="button" onClick={onRemove} className="h-auto p-0 pt-0 text-muted-foreground text-[11px]">
          {t('remove')}
        </Button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleChange} />
    </div>
  );
}
