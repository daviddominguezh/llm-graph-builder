'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

import { formatSize, type QueuedFile } from './uploaderHelpers';

interface UploaderFooterProps {
  files: QueuedFile[];
  onClear: () => void;
}

function totalBytes(files: QueuedFile[]): number {
  return files.reduce((sum, q) => sum + q.file.size, 0);
}

export function UploaderFooter({ files, onClear }: UploaderFooterProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const size = formatSize(totalBytes(files));
  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {t('totalSize', { count: files.length, size })}
      </span>
      <Button variant="ghost" size="sm" type="button" className="h-7 text-xs" onClick={onClear}>
        {t('clearAll')}
      </Button>
    </div>
  );
}
