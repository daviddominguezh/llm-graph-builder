'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

const EMPTY_ROW_COUNT = 0;
const HEADER_ROW_OFFSET = 1;

export type ExportState = 'idle' | 'generating';

interface UseCsvExportResult {
  state: ExportState;
  run: (url: string, filename: string) => Promise<void>;
  abort: () => void;
}

export function useCsvExport(): UseCsvExportResult {
  const t = useTranslations('forms.export');
  const [state, setState] = useState<ExportState>('idle');
  const controllerRef = useRef<AbortController | null>(null);

  const run = async (url: string, filename: string): Promise<void> => {
    setState('generating');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await runExportRequest({ url, filename, controller, t });
    } catch (err) {
      handleError(err, t);
    } finally {
      setState('idle');
      controllerRef.current = null;
    }
  };

  const abort = (): void => {
    controllerRef.current?.abort();
  };

  return { state, run, abort };
}

interface RequestArgs {
  url: string;
  filename: string;
  controller: AbortController;
  t: ReturnType<typeof useTranslations>;
}

async function runExportRequest(args: RequestArgs): Promise<void> {
  const res = await fetch(args.url, { signal: args.controller.signal });
  if (!res.ok) throw new Error(`http-${String(res.status)}`);
  const truncated = res.headers.get('x-forms-truncated') === 'true';
  const blob = await res.blob();
  const text = await blob.text();
  const rows = countRows(text);
  if (rows === EMPTY_ROW_COUNT) {
    toast.error(args.t('errorRaceEmpty'));
    return;
  }
  triggerDownload(blob, args.filename);
  showSuccessToast(rows, truncated, args.t);
}

function triggerDownload(blob: Blob, filename: string): void {
  const dl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(dl);
}

function showSuccessToast(rows: number, truncated: boolean, t: ReturnType<typeof useTranslations>): void {
  toast.success(truncated ? t('successTruncated', { count: rows }) : t('success', { count: rows }));
}

function handleError(err: unknown, _t: ReturnType<typeof useTranslations>): void {
  if (err instanceof Error && err.name === 'AbortError') return;
  toast.error(String(err));
}

function countRows(csv: string): number {
  const lines = csv.split('\n').filter((l) => l.length > EMPTY_ROW_COUNT);
  return Math.max(EMPTY_ROW_COUNT, lines.length - HEADER_ROW_OFFSET);
}
