'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useCallback, useRef, useState } from 'react';

import { Scrollable } from '@/app/components/Scrollable';

import { FileStatusSubscriber } from './FileStatusSubscriber';
import { StagedFileRow } from './StagedFileRow';
import { ACCEPTED_EXTENSIONS } from './ragUploadConstants';
import { type UploadFileInput, useRagUpload } from './useRagUpload';
import type { StagedFile, StagedStatus } from './useStagedFiles';

interface StagedFilesDialogProps {
  storeId: string;
  open: boolean;
  staged: StagedFile[];
  isUploading: boolean;
  isAllDone: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onOcrChange: (key: string, enabled: boolean) => void;
  onLanguagesChange: (key: string, next: string[]) => void;
  onUpdate: (key: string, patch: Partial<StagedFile>) => void;
  onStartUpload: () => Promise<void>;
  onClose: () => void;
}

function fileListToArray(list: FileList): File[] {
  return Array.from(list);
}

interface DropAreaProps {
  onFiles: (files: File[]) => void;
  disabled: boolean;
  children: React.ReactNode;
}

function DropArea({ onFiles, disabled, children }: DropAreaProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false);
  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    if (disabled) return;
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(): void {
    setDragging(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>): void {
    if (disabled) return;
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(fileListToArray(e.dataTransfer.files));
  }
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-1 min-h-0 flex-col rounded-md transition-colors ${
        dragging ? 'ring-1 ring-primary bg-input/40' : ''
      }`}
    >
      {children}
    </div>
  );
}

function EmptyStateBody({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inputRef = useRef<HTMLInputElement>(null);
  function open(): void {
    inputRef.current?.click();
  }
  function onPick(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(fileListToArray(e.target.files));
      e.target.value = '';
    }
  }
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12">
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-sm font-medium">{t('idle')}</span>
      <span className="text-[10px] font-mono text-muted-foreground/70">{t('extensions')}</span>
      <Button size="sm" type="button" onClick={open} disabled={disabled}>
        {t('upload')}
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

interface StagedListProps {
  storeId: string;
  staged: StagedFile[];
  locked: boolean;
  onRemove: (key: string) => void;
  onOcrChange: (key: string, enabled: boolean) => void;
  onLanguagesChange: (key: string, next: string[]) => void;
  onUpdate: (key: string, patch: Partial<StagedFile>) => void;
}

function StagedList({
  storeId,
  staged,
  locked,
  onRemove,
  onOcrChange,
  onLanguagesChange,
  onUpdate,
}: StagedListProps): React.JSX.Element {
  return (
    <Scrollable className="flex-1 min-h-0">
      <div className="flex flex-col gap-2 pr-1">
        {staged.map((s) => (
          <div key={s.key}>
            <StagedFileRow
              staged={s}
              locked={locked}
              onRemove={() => onRemove(s.key)}
              onOcrChange={(v) => onOcrChange(s.key, v)}
              onLanguagesChange={(next) => onLanguagesChange(s.key, next)}
            />
            {s.fileId !== null && s.status !== 'done' && s.status !== 'failed' && (
              <FileStatusSubscriber
                storeId={storeId}
                fileId={s.fileId}
                onUpdate={(status, error) =>
                  onUpdate(s.key, { status: status as StagedStatus, error })
                }
              />
            )}
          </div>
        ))}
      </div>
    </Scrollable>
  );
}

interface FooterAddButtonProps {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

function FooterAddButton({ onFiles, disabled }: FooterAddButtonProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inputRef = useRef<HTMLInputElement>(null);
  function open(): void {
    inputRef.current?.click();
  }
  function onPick(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(fileListToArray(e.target.files));
      e.target.value = '';
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={open} disabled={disabled}>
        {t('addMore')}
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

interface CtaProps {
  staged: StagedFile[];
  isUploading: boolean;
  isAllDone: boolean;
  onStartUpload: () => Promise<void>;
  onClose: () => void;
}

function CtaButton({
  staged,
  isUploading,
  isAllDone,
  onStartUpload,
  onClose,
}: CtaProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  if (isAllDone) {
    return (
      <Button type="button" size="sm" onClick={onClose}>
        {t('close')}
      </Button>
    );
  }
  if (isUploading) {
    return (
      <Button type="button" size="sm" disabled className="gap-2">
        <Loader2 className="size-3 animate-spin" />
        {t('uploadInProgress')}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      disabled={staged.length === 0}
      onClick={() => void onStartUpload()}
    >
      {t('uploadCta', { count: staged.length })}
    </Button>
  );
}

export function StagedFilesDialog({
  storeId,
  open,
  staged,
  isUploading,
  isAllDone,
  onAdd,
  onRemove,
  onOcrChange,
  onLanguagesChange,
  onUpdate,
  onStartUpload,
  onClose,
}: StagedFilesDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const locked = isUploading;
  const empty = staged.length === 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next === false && locked) return;
        if (next === false) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 sm:max-w-2xl"
        showCloseButton={!locked}
      >
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <DropArea onFiles={onAdd} disabled={locked}>
          {empty ? (
            <EmptyStateBody onFiles={onAdd} disabled={locked} />
          ) : (
            <StagedList
              storeId={storeId}
              staged={staged}
              locked={locked}
              onRemove={onRemove}
              onOcrChange={onOcrChange}
              onLanguagesChange={onLanguagesChange}
              onUpdate={onUpdate}
            />
          )}
        </DropArea>
        <DialogFooter className="sm:justify-between">
          {!empty && !isAllDone && <FooterAddButton onFiles={onAdd} disabled={locked} />}
          <CtaButton
            staged={staged}
            isUploading={isUploading}
            isAllDone={isAllDone}
            onStartUpload={onStartUpload}
            onClose={onClose}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UseStagedUploadInput {
  storeId: string;
  tenantId: string;
  staged: StagedFile[];
  update: (key: string, patch: Partial<StagedFile>) => void;
  onFileConfirmed: (fileId: string) => void;
}

export function useStagedUpload({
  storeId,
  tenantId,
  staged,
  update,
  onFileConfirmed,
}: UseStagedUploadInput): { isUploading: boolean; start: () => Promise<void> } {
  const { uploadOne } = useRagUpload({ storeId, tenantId });
  const [isUploading, setIsUploading] = useState(false);

  const runOne = useCallback(
    async (s: StagedFile): Promise<void> => {
      update(s.key, { status: 'uploading' });
      const input: UploadFileInput = { file: s.file, languages: s.languages };
      const result = await uploadOne(input, {
        onConfirmed: (fileId) => {
          update(s.key, { fileId, status: 'parsing' });
          onFileConfirmed(fileId);
        },
      });
      if (result.error !== undefined) {
        update(s.key, {
          fileId: result.fileId === '' ? null : result.fileId,
          status: 'failed',
          error: result.error,
        });
      }
    },
    [onFileConfirmed, update, uploadOne]
  );

  const start = useCallback(async (): Promise<void> => {
    setIsUploading(true);
    await staged.reduce<Promise<void>>(async (prev, s) => {
      await prev;
      if (s.status !== 'idle') return;
      await runOne(s);
    }, Promise.resolve());
    setIsUploading(false);
  }, [runOne, staged]);

  return { isUploading, start };
}
