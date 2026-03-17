'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Copy, Loader2, Terminal } from 'lucide-react';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkGfm from 'remark-gfm';
import '@wooorm/starry-night/style/light';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ToolCallResponse } from '../../lib/api';

type ResultState = 'empty' | 'loading' | 'done';

interface ToolTestResultProps {
  state: ResultState;
  result: ToolCallResponse | null;
  startedAt: number | null;
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="animate-pulse text-xs text-muted-foreground">{t('running')}</p>
      {startedAt !== null && <ElapsedTimer startedAt={startedAt} />}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={handleCopy}>
      {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
    </Button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  const markdown = `\`\`\`json\n${json}\n\`\`\``;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton text={json} />
      </div>
      <div className="overflow-x-auto rounded-lg bg-muted/50 text-[11px] leading-relaxed [&_pre]:p-4">
        <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
          {markdown}
        </MarkdownHooks>
      </div>
    </div>
  );
}

function SuccessResult({ result }: { result: unknown }) {
  const t = useTranslations('toolTest');
  return (
    <div className="flex flex-col gap-3 p-5 animate-in fade-in-0 duration-300">
      <Badge className="w-fit bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-transparent animate-in slide-in-from-top-1 fade-in-0 duration-200">
        {t('success')}
      </Badge>
      <JsonBlock value={result} />
    </div>
  );
}

function ErrorResult({ error }: { error: { message: string; code?: string; details?: unknown } }) {
  const t = useTranslations('toolTest');
  return (
    <div className="flex flex-col gap-3 p-5 animate-in fade-in-0 duration-300">
      <Badge variant="destructive" className="w-fit animate-in slide-in-from-top-1 fade-in-0 duration-200">
        {t('error')}
      </Badge>
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
          <JsonBlock value={error.details} />
        </div>
      )}
    </div>
  );
}

function DoneResult({ result }: { result: ToolCallResponse }) {
  if (result.success) return <SuccessResult result={result.result} />;
  return <ErrorResult error={result.error} />;
}

export function ToolTestResult({ state, result, startedAt }: ToolTestResultProps) {
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
  if (state === 'done' && result !== null) return <DoneResult result={result} />;
  return <EmptyState message={t('emptyState')} />;
}
