'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import { AlertTriangle, Brain } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isJsonObject, JsonBlock as JsonViewer } from '@/app/components/panels/JsonDisplay';

import { JsonBlock } from './JsonBlock';
import { MessageCards } from './MessageCards';
import { NodeHeader } from './NodeHeader';
import { parseResponse } from './responseHelpers';

interface VisitedNodeDetailsProps {
  node: SchemaNode;
  visit: NodeVisitRow;
}

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

function ResponseSection({ visit }: { visit: NodeVisitRow }) {
  const t = useTranslations('dashboard.debug');
  const parsed = parseResponse(visit.response);

  return (
    <>
      {parsed.error !== null && <ErrorBanner message={parsed.error} />}
      <details className="group" open>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          {t('llmResponse')}
        </summary>
        <div className="mt-1">
          {isJsonObject(visit.response) ? (
            <JsonViewer value={visit.response as Record<string, unknown>} />
          ) : (
            <JsonBlock label={t('llmResponse')} data={visit.response} />
          )}
        </div>
      </details>
    </>
  );
}

function visitToTokens(visit: NodeVisitRow) {
  return {
    input: visit.input_tokens,
    output: visit.output_tokens,
    cached: visit.cached_tokens,
    costUSD: visit.cost,
  };
}

export function VisitedNodeDetails({ node, visit }: VisitedNodeDetailsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <NodeHeader node={node} />
        <div className="mt-1 flex items-center gap-2">
          <TokenDisplay tokens={visitToTokens(visit)} durationMs={visit.duration_ms} />
          <span className="text-[10px] text-muted-foreground/40">|</span>
          <span className="inline-flex items-center font-mono text-[10px] text-muted-foreground">
            <Brain className="mr-0.5 size-2.5" />
            {visit.model}
          </span>
        </div>
      </div>
      <MessageCards data={visit.messages_sent} />
      <ResponseSection visit={visit} />
    </div>
  );
}
