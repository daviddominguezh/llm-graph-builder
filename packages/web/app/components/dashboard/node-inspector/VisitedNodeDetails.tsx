'use client';

import { useTranslations } from 'next-intl';

import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import type { NodeVisitRow } from '@/app/lib/dashboard';

import { JsonBlock } from './JsonBlock';
import { NodeHeader } from './NodeHeader';
import { parseResponse } from './responseHelpers';
import { TokenTable } from './TokenTable';

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

export function VisitedNodeDetails({ node, visit }: VisitedNodeDetailsProps) {
  const t = useTranslations('dashboard.debug');

  return (
    <div className="flex flex-col gap-3">
      <NodeHeader node={node} />
      <JsonBlock label={t('messagesSent')} data={visit.messages_sent} />
      <ResponseSection visit={visit} />

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('tokenUsage')}</p>
        <TokenTable visit={visit} />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          {t('duration')}: <span className="font-mono text-foreground">{visit.duration_ms}ms</span>
        </span>
        <span>
          {t('model')}: <span className="font-mono text-foreground">{visit.model}</span>
        </span>
      </div>
    </div>
  );
}
