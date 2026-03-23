'use client';

import { useTranslations } from 'next-intl';
import { Brain } from 'lucide-react';

import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';

import { JsonBlock } from './JsonBlock';
import { NodeHeader } from './NodeHeader';
import { parseResponse } from './responseHelpers';

interface VisitedNodeDetailsProps {
  node: SchemaNode;
  visit: NodeVisitRow;
}

function ResponseSection({ visit }: { visit: NodeVisitRow }) {
  const t = useTranslations('dashboard.debug');
  const parsed = parseResponse(visit.response);
  const llmLabel = parsed.hasToolCalls ? `${t('llmResponse')} (${t('toolCall')})` : t('llmResponse');

  return (
    <>
      <JsonBlock label={llmLabel} data={parsed.hasToolCalls ? parsed.toolCallArgs : visit.response} />
      {parsed.hasToolCalls && <JsonBlock label={t('toolCallOutput')} data={parsed.toolCallOutputs} />}
      {parsed.structuredOutput !== null && (
        <JsonBlock label={t('structuredOutput')} data={parsed.structuredOutput} />
      )}
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
  const t = useTranslations('dashboard.debug');

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
      <JsonBlock label={t('messagesSent')} data={visit.messages_sent} />
      <ResponseSection visit={visit} />
    </div>
  );
}
