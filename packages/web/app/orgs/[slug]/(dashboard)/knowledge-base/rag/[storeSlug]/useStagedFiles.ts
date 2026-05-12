'use client';

import { useCallback, useState } from 'react';

import { isImageFile, isStandardOcrCompatible } from './ragUploadConstants';

export type StagedStatus = 'idle' | 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'done' | 'failed';
export type OcrMode = 'standard' | 'advanced';

export interface StagedFile {
  key: string;
  file: File;
  ocrEnabled: boolean;
  ocrLocked: boolean;
  ocrMode: OcrMode;
  ocrModeLocked: boolean;
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
  setOcrMode: (key: string, mode: OcrMode) => void;
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
  const standardCompatible = isStandardOcrCompatible(file);
  return {
    key: nextKey(),
    file,
    // OCR off by default. Images force it on (ocrLocked).
    ocrEnabled: ocrLocked,
    ocrLocked,
    ocrMode: standardCompatible ? 'standard' : 'advanced',
    ocrModeLocked: !standardCompatible,
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
    setStaged((prev) => prev.map((s) => (s.key === key && !s.ocrLocked ? { ...s, ocrEnabled: enabled } : s)));
  }, []);

  const setOcrMode = useCallback((key: string, mode: OcrMode): void => {
    setStaged((prev) => prev.map((s) => (s.key === key && !s.ocrModeLocked ? { ...s, ocrMode: mode } : s)));
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

  return { staged, add, remove, setOcr, setOcrMode, setLanguages, update, clear };
}
