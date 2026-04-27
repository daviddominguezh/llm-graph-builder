'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatSize, getExt, type QueuedFile } from './uploaderHelpers';

function ExtBadge({ name }: { name: string }): React.JSX.Element {
  const ext = getExt(name).slice(1) || 'file';
  return (
    <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
      {ext}
    </span>
  );
}

interface FileRowProps {
  queued: QueuedFile;
  onRemove: (id: string) => void;
}

function FileRow({ queued, onRemove }: FileRowProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <div className="group flex items-center gap-2.5 py-1.5 px-1 rounded transition-colors hover:bg-muted/40 animate-in fade-in slide-in-from-top-1 duration-200">
      <ExtBadge name={queued.file.name} />
      <span className="flex-1 truncate text-xs">{queued.file.name}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatSize(queued.file.size)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label={t('remove')}
        className="size-5 text-muted-foreground/50 hover:text-destructive transition-colors"
        onClick={() => onRemove(queued.id)}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

interface FileListProps {
  files: QueuedFile[];
  onRemove: (id: string) => void;
}

export function FileList({ files, onRemove }: FileListProps): React.JSX.Element {
  return (
    <div className="flex flex-col divide-y divide-border/40">
      {files.map((q) => (
        <FileRow key={q.id} queued={q} onRemove={onRemove} />
      ))}
    </div>
  );
}

