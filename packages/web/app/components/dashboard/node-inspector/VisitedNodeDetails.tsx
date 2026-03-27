'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import { Brain } from 'lucide-react';

import { MessageCards } from './MessageCards';
import { NodeHeader } from './NodeHeader';
import { ResponseSection } from './ResponseSection';

interface VisitedNodeDetailsProps {
  node: SchemaNode;
  visit: NodeVisitRow;
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
