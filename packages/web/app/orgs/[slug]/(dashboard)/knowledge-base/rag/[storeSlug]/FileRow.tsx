'use client';

import { deleteFileAction } from '@/app/actions/ragFiles';
import type { RagFileRow, RagFileStatus, SemanticChunk } from '@/app/lib/ragFiles';
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
import { ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FileChunksTable } from './FileChunksTable';
import { FileStatusStream } from './FileStatusStream';
import { FileTypeIcon } from './FileTypeIcon';

interface FileRowProps {
  storeId: string;
  file: RagFileRow;
  onDeleted: (fileId: string) => void;
  onStatusReachedDone: (fileId: string) => void;
  forceExpanded?: boolean;
  overrideChunks?: SemanticChunk[];
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
}): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragStatus');
  const title = status === 'failed' && error !== null ? error : undefined;
  if (status === 'done') return null;
  if (IN_PROGRESS.has(status)) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-blue-500">
        <Loader2 className="size-3 animate-spin" />
        {t(status)}
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

function formatUploadedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
            className="relative"
          >
            <span className={deleting ? 'invisible' : ''}>{t('deleteConfirm')}</span>
            {deleting && (
              <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin" />
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface FileRowHeaderProps {
  file: RagFileRow;
  status: RagFileStatus;
  error: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRequestDelete: () => void;
}

function FileRowHeader({
  file,
  status,
  error,
  expanded,
  onToggle,
  onRequestDelete,
}: FileRowHeaderProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  const canToggle = status === 'done';
  const canDelete = !IN_PROGRESS.has(status);
  return (
    <div className="sticky top-0 z-20 rounded-t-md bg-background">
      <button
        type="button"
        onClick={canToggle ? onToggle : undefined}
        aria-expanded={canToggle ? expanded : undefined}
        aria-label={canToggle ? t('openChunks') : undefined}
        className={`flex h-9 w-full items-center gap-3 px-3 text-left ${canToggle ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <ChevronRight
          className={`size-4 shrink-0 transition-transform duration-150 ${
            canToggle ? 'text-muted-foreground' : 'invisible'
          } ${expanded && canToggle ? 'rotate-90' : ''}`}
        />
        <FileTypeIcon mimeType={file.mime_type} filename={file.filename} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 truncate text-xs font-mono font-medium">{file.filename}</span>
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            {formatBytes(file.size_bytes)}
            {file.page_count !== null && <> · {t('pageCount', { count: file.page_count })}</>}
            {' · '}
            {formatUploadedAt(file.created_at)}
          </span>
        </div>
        <StatusPill status={status} error={error} />
        {canDelete && <span className="size-8 shrink-0" aria-hidden="true" />}
      </button>
      {canDelete && (
        <Button
          variant="destructive"
          size="icon"
          aria-label={t('remove')}
          onClick={onRequestDelete}
          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function useSyncedExpansion(forceExpanded: boolean): {
  expanded: boolean;
  toggle: () => void;
} {
  const [expanded, setExpanded] = useState(forceExpanded);
  const [prevForce, setPrevForce] = useState(forceExpanded);
  if (forceExpanded !== prevForce) {
    setPrevForce(forceExpanded);
    setExpanded(forceExpanded);
  }
  return { expanded, toggle: () => setExpanded((v) => !v) };
}

export function FileRow({
  storeId,
  file,
  onDeleted,
  onStatusReachedDone,
  forceExpanded = false,
  overrideChunks,
}: FileRowProps): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { expanded, toggle } = useSyncedExpansion(forceExpanded);

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
        <div className="group rounded-md border">
          <FileRowHeader
            file={file}
            status={status}
            error={error}
            expanded={expanded && status === 'done'}
            onToggle={toggle}
            onRequestDelete={() => setConfirmOpen(true)}
          />
          {expanded && status === 'done' && (
            <div className="border-t">
              <FileChunksTable
                storeId={storeId}
                fileId={file.id}
                overrideChunks={overrideChunks}
              />
            </div>
          )}
          <DeleteConfirmDialog
            open={confirmOpen}
            deleting={deleting}
            onOpenChange={setConfirmOpen}
            onConfirm={() => void handleDelete()}
          />
        </div>
      )}
    </FileStatusStream>
  );
}
