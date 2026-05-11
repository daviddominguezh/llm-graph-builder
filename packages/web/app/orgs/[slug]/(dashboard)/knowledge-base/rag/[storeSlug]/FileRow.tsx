'use client';

import { deleteFileAction } from '@/app/actions/ragFiles';
import type { RagFileRow, RagFileStatus } from '@/app/lib/ragFiles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight, FileText, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FileStatusStream } from './FileStatusStream';

interface FileRowProps {
  storeId: string;
  file: RagFileRow;
  onOpenChunks: (file: RagFileRow) => void;
  onDeleted: (fileId: string) => void;
  onStatusReachedDone: (fileId: string) => void;
}

const BYTES_KB = 1024;
const ONE_DECIMAL = 1;

const IN_PROGRESS: ReadonlySet<RagFileStatus> = new Set([
  'uploading',
  'parsing',
  'chunking',
  'embedding',
]);

function statusPillColor(status: RagFileStatus): string {
  if (status === 'done') return 'bg-emerald-500/15 text-emerald-600';
  if (status === 'failed') return 'bg-destructive/15 text-destructive';
  return 'bg-input/60 text-muted-foreground';
}

function StatusPill({
  status,
  error,
}: {
  status: RagFileStatus;
  error: string | null;
}): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragStatus');
  const title = status === 'failed' && error !== null ? error : undefined;
  if (IN_PROGRESS.has(status)) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-blue-500">
        <Loader2 className="size-3 animate-spin" />
        {t(status)}
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="flex items-center text-emerald-600" aria-label={t('done')} title={t('done')}>
        <Check className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${statusPillColor(status)}`}
      title={title}
    >
      {t(status)}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < BYTES_KB) return `${String(n)} B`;
  const kb = n / BYTES_KB;
  if (kb < BYTES_KB) return `${kb.toFixed(ONE_DECIMAL)} KB`;
  const mb = kb / BYTES_KB;
  return `${mb.toFixed(ONE_DECIMAL)} MB`;
}

interface DeleteDialogProps {
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: DeleteDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deleting} onClick={onConfirm}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface FileRowContentProps {
  file: RagFileRow;
  status: RagFileStatus;
  error: string | null;
  confirmOpen: boolean;
  deleting: boolean;
  onOpenChunks: (file: RagFileRow) => void;
  onRequestDelete: () => void;
  onCancelDelete: (open: boolean) => void;
  onConfirmDelete: () => void;
}

function FileRowContent({
  file,
  status,
  error,
  confirmOpen,
  deleting,
  onOpenChunks,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: FileRowContentProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium">{file.filename}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatBytes(file.size_bytes)}
          {file.page_count !== null && <> · {t('pageCount', { count: file.page_count })}</>}
        </span>
      </div>
      <StatusPill status={status} error={error} />
      {status === 'done' && (
        <Button variant="ghost" size="icon" aria-label={t('openChunks')} onClick={() => onOpenChunks(file)}>
          <ChevronRight className="size-4" />
        </Button>
      )}
      <Button variant="destructive" size="icon" aria-label={t('remove')} onClick={onRequestDelete}>
        <Trash2 className="size-4" />
      </Button>
      <DeleteConfirmDialog
        open={confirmOpen}
        deleting={deleting}
        onOpenChange={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

export function FileRow({
  storeId,
  file,
  onOpenChunks,
  onDeleted,
  onStatusReachedDone,
}: FileRowProps): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    await deleteFileAction(storeId, file.id);
    setDeleting(false);
    setConfirmOpen(false);
    onDeleted(file.id);
  }

  return (
    <FileStatusStream
      fileId={file.id}
      storeId={storeId}
      initialStatus={file.status}
      initialError={file.status_error}
      onTerminal={() => onStatusReachedDone(file.id)}
    >
      {({ status, error }) => (
        <FileRowContent
          file={file}
          status={status}
          error={error}
          confirmOpen={confirmOpen}
          deleting={deleting}
          onOpenChunks={onOpenChunks}
          onRequestDelete={() => setConfirmOpen(true)}
          onCancelDelete={setConfirmOpen}
          onConfirmDelete={() => void handleDelete()}
        />
      )}
    </FileStatusStream>
  );
}
