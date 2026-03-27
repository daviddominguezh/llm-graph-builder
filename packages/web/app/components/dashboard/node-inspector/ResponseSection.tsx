'use client';

import { useState } from 'react';

import { AlertTriangle, Braces, LayoutList } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isJsonObject, JsonBlock as JsonViewer } from '@/app/components/panels/JsonDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';

import { JsonBlock } from './JsonBlock';
import { ResponseMessageCards } from './ResponseMessageCards';
import { parseResponse } from './responseHelpers';

function ErrorBanner({ message }: { message: string }) {
  const t = useTranslations('dashboard.debug');
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <p className="text-xs font-medium text-destructive">{t('nodeError')}</p>
        <p className="mt-0.5 font-mono text-xs text-destructive/80">{message}</p>
      </div>
    </div>
  );
}

function isResponseMessageArray(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  const first: unknown = data[0];
  return typeof first === 'object' && first !== null && 'role' in first;
}

function RawJsonView({ data }: { data: unknown }) {
  const t = useTranslations('dashboard.debug');
  if (isJsonObject(data)) {
    return <JsonViewer value={data as Record<string, unknown>} />;
  }
  return <JsonBlock label={t('llmResponse')} data={data} />;
}

function ViewToggle({ showRaw, onToggle }: { showRaw: boolean; onToggle: () => void }) {
  const t = useTranslations('dashboard.debug');
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {showRaw ? <LayoutList className="size-3" /> : <Braces className="size-3" />}
      {showRaw ? t('viewFormatted') : t('viewRaw')}
    </button>
  );
}

export function ResponseSection({ visit }: { visit: NodeVisitRow }) {
  const t = useTranslations('dashboard.debug');
  const parsed = parseResponse(visit.response);
  const [showRaw, setShowRaw] = useState(false);
  const hasMessageFormat = isResponseMessageArray(visit.response);

  if (parsed.error !== null) {
    return <ErrorBanner message={parsed.error} />;
  }

  return (
    <details className="group" open>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        <span className="inline-flex items-center gap-2">
          {t('llmResponse')}
          {hasMessageFormat && (
            <ViewToggle showRaw={showRaw} onToggle={() => setShowRaw((v) => !v)} />
          )}
        </span>
      </summary>
      <div className="mt-1">
        {hasMessageFormat && !showRaw ? (
          <ResponseMessageCards data={visit.response} />
        ) : (
          <RawJsonView data={visit.response} />
        )}
      </div>
    </details>
  );
}
