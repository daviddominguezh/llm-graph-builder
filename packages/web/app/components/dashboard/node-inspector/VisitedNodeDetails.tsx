'use client';

import { useTranslations } from 'next-intl';

import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import type { NodeVisitRow } from '@/app/lib/dashboard';

import { JsonBlock } from './JsonBlock';
import { NodeHeader } from './NodeHeader';
import { TokenTable } from './TokenTable';

interface VisitedNodeDetailsProps {
  node: SchemaNode;
  visit: NodeVisitRow;
}

function extractStructuredOutput(response: unknown): unknown {
  if (typeof response !== 'object' || response === null) return null;
  const rec = response as Record<string, unknown>;
  if ('structured_output' in rec) return rec['structured_output'];
  return null;
}

export function VisitedNodeDetails({ node, visit }: VisitedNodeDetailsProps) {
  const t = useTranslations('dashboard.debug');
  const structuredOutput = extractStructuredOutput(visit.response);

  return (
    <div className="flex flex-col gap-3">
      <NodeHeader node={node} />
      <JsonBlock label={t('messagesSent')} data={visit.messages_sent} />
      <JsonBlock label={t('llmResponse')} data={visit.response} />
      {structuredOutput !== null && <JsonBlock label={t('structuredOutput')} data={structuredOutput} />}

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
