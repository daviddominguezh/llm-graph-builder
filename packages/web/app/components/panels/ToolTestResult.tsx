'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { ToolCallResponse } from '../../lib/api';
import { JsonBlock, extractMcpPayload, isJsonObject } from './JsonDisplay';

type ResultState = 'empty' | 'loading' | 'done';

interface ToolTestResultProps {
  state: ResultState;
  result: ToolCallResponse | null;
  startedAt: number | null;
  durationMs: number | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8">
        <Terminal className="size-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  const SHOW_AFTER_MS = 5000;

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [startedAt]);

  if (elapsed < SHOW_AFTER_MS) return null;
  const seconds = (elapsed / 1000).toFixed(1);
  return <span className="text-[10px] tabular-nums text-muted-foreground">{seconds}s</span>;
}

function LoadingState({ startedAt }: { startedAt: number | null }) {
  const t = useTranslations('toolTest');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="animate-pulse text-xs text-muted-foreground">{t('running')}</p>
      {startedAt !== null && <ElapsedTimer startedAt={startedAt} />}
    </div>
  );
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${String(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function ResultHeader({
  success,
  durationMs,
}: {
  success: boolean;
  durationMs: number | null;
  copyText?: string;
}) {
  const t = useTranslations('toolTest');
  return (
    <div className="shrink-0 flex items-center gap-4 text-xs animate-in slide-in-from-top-1 fade-in-0 duration-200">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{t('status')}:</span>
        {success ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-transparent">
            {t('success')}
          </Badge>
        ) : (
          <Badge variant="destructive">{t('error')}</Badge>
        )}
      </div>
      {durationMs !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t('duration')}:</span>
          <span className="tabular-nums font-medium">{formatDuration(durationMs)}</span>
        </div>
      )}
    </div>
  );
}

function SuccessResult({ result, durationMs }: { result: unknown; durationMs: number | null }) {
  const payload = extractMcpPayload(result);

  return (
    <div className="min-w-0 flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-300">
      <div className="shrink-0 px-5 pt-5 pb-3">
        <ResultHeader success durationMs={durationMs} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {isJsonObject(payload) ? (
          <JsonBlock value={payload} />
        ) : (
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-[11px] leading-relaxed">
            {String(payload)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ErrorResult({
  error,
  durationMs,
}: {
  error: { message: string; code?: string; details?: unknown };
  durationMs: number | null;
}) {
  const t = useTranslations('toolTest');
  return (
    <div className="min-w-0 flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-300">
      <div className="shrink-0 px-5 pt-5 pb-3">
        <ResultHeader success={false} durationMs={durationMs} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{error.message}</p>
          {error.code !== undefined && (
            <div className="flex items-baseline gap-2 text-xs">
              <span className="text-muted-foreground">{t('errorCode')}</span>
              <code className="font-mono">{error.code}</code>
            </div>
          )}
          {error.details !== undefined && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('errorDetails')}
              </span>
              {isJsonObject(error.details) ? (
                <JsonBlock value={error.details} />
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-[11px]">
                  {String(error.details)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DoneResult({ result, durationMs }: { result: ToolCallResponse; durationMs: number | null }) {
  if (result.success) return <SuccessResult result={result.result} durationMs={durationMs} />;
  return <ErrorResult error={result.error} durationMs={durationMs} />;
}

export function ToolTestResult({ state, result, startedAt, durationMs }: ToolTestResultProps) {
  const t = useTranslations('toolTest');
  const showLoading = useRef(false);

  useEffect(() => {
    if (state !== 'loading') {
      showLoading.current = false;
      return;
    }
    const id = setTimeout(() => {
      showLoading.current = true;
    }, 300);
    return () => clearTimeout(id);
  }, [state]);

  if (state === 'loading') return <LoadingState startedAt={startedAt} />;
  if (state === 'done' && result !== null) return <DoneResult result={result} durationMs={durationMs} />;
  return <EmptyState message={t('emptyState')} />;
}
