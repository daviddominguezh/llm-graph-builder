'use client';

import { JsonBlock as JsonViewer, isJsonObject } from '@/app/components/panels/JsonDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import { AlertTriangle, Braces, LayoutList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

const activeTab = 'bg-popover dark:bg-input text-foreground shadow-sm';
const inactiveTab = 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';
const tabBase =
  'cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';

function ViewTabs({ showRaw, onChange }: { showRaw: boolean; onChange: (raw: boolean) => void }) {
  const t = useTranslations('dashboard.debug');
  return (
    <div
      className="inline-flex gap-1 dark:gap-0.5 rounded-sm border bg-muted/50 p-0.5"
      onClick={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`${tabBase} ${showRaw ? inactiveTab : activeTab}`}
      >
        <LayoutList className="size-3" />
        {t('viewFormatted')}
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`${tabBase} ${showRaw ? activeTab : inactiveTab}`}
      >
        <Braces className="size-3" />
        {t('viewRaw')}
      </button>
    </div>
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
    <details className="group relative" open>
      <summary className="h-6 cursor-pointer leading-6 text-xs font-medium text-muted-foreground hover:text-foreground">
        {t('llmResponse')}
      </summary>
      {hasMessageFormat && (
        <div className="absolute right-0 top-0 flex h-6 items-center">
          <ViewTabs showRaw={showRaw} onChange={setShowRaw} />
        </div>
      )}
      <div className="mt-1">
        {hasMessageFormat && !showRaw ? (
          <ResponseMessageCards data={visit.response} />
        ) : (
          <div className="rounded-md border bg-background">
            <RawJsonView data={visit.response} />
          </div>
        )}
      </div>
    </details>
  );
}
