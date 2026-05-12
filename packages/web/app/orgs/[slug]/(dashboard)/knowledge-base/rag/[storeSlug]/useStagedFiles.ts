'use client';

import { useCallback, useState } from 'react';

import { isImageFile } from './ragUploadConstants';

export type StagedStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'done'
  | 'failed';

export interface StagedFile {
  key: string;
  file: File;
  ocrEnabled: boolean;
  ocrLocked: boolean;
  languages: string[];
  status: StagedStatus;
  fileId: string | null;
  error: string | null;
}

interface UseStagedFilesReturn {
  staged: StagedFile[];
  add: (files: File[]) => void;
  remove: (key: string) => void;
  setOcr: (key: string, enabled: boolean) => void;
  setLanguages: (key: string, languages: string[]) => void;
  update: (key: string, patch: Partial<StagedFile>) => void;
  clear: () => void;
}

let counter = 0;
function nextKey(): string {
  counter += 1;
  return `staged-${String(counter)}`;
}

function stagedFromFile(file: File): StagedFile {
  const ocrLocked = isImageFile(file);
  return {
    key: nextKey(),
    file,
    ocrEnabled: ocrLocked,
    ocrLocked,
    languages: [],
    status: 'idle',
    fileId: null,
    error: null,
  };
}

export function useStagedFiles(): UseStagedFilesReturn {
  const [staged, setStaged] = useState<StagedFile[]>([]);

  const add = useCallback((files: File[]): void => {
    if (files.length === 0) return;
    setStaged((prev) => [...prev, ...files.map(stagedFromFile)]);
  }, []);

  const remove = useCallback((key: string): void => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const setOcr = useCallback((key: string, enabled: boolean): void => {
    setStaged((prev) =>
      prev.map((s) => (s.key === key && !s.ocrLocked ? { ...s, ocrEnabled: enabled } : s))
    );
  }, []);

  const setLanguages = useCallback((key: string, languages: string[]): void => {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, languages } : s)));
  }, []);

  const update = useCallback((key: string, patch: Partial<StagedFile>): void => {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const clear = useCallback((): void => {
    setStaged([]);
  }, []);

  return { staged, add, remove, setOcr, setLanguages, update, clear };
}
