'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type QueuedFile, isAccepted, makeId } from './uploaderHelpers';

export interface FileQueue {
  files: QueuedFile[];
  add: (list: FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function useFileQueue(): FileQueue {
  const t = useTranslations('knowledgeBase');
  const [files, setFiles] = useState<QueuedFile[]>([]);

  const add = useCallback(
    (list: FileList) => {
      const accepted: QueuedFile[] = [];
      let skipped = 0;
      for (const file of Array.from(list)) {
        if (isAccepted(file)) accepted.push({ id: makeId(), file });
        else skipped++;
      }
      if (skipped > 0) toast.error(t('filesSkipped', { count: skipped }));
      if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    },
    [t]
  );

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
  }, []);

  return { files, add, remove, clear };
}
