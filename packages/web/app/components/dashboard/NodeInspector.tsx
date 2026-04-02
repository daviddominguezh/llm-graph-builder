'use client';

import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { NodeHeader } from './node-inspector/NodeHeader';
import { VisitedNodeDetails } from './node-inspector/VisitedNodeDetails';

interface NodeInspectorProps {
  nodeId: string | null;
  nodeVisits: NodeVisitRow[];
  mutedNodeIds: Set<string>;
  graphNodes: SchemaNode[];
}

const INITIAL_STEP = 'INITIAL_STEP';

function deriveEndpoints(visits: NodeVisitRow[]): { first: string | undefined; last: string | undefined } {
  const real = visits.filter((v) => v.node_id !== INITIAL_STEP);
  const first = real[0]?.node_id;
  const last = real[real.length - 1]?.node_id;
  return { first, last };
}

function ExecutionPath({ first, last }: { first: string; last: string }) {
  const t = useTranslations('dashboard.debug');

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">{t('executionPath')}</span>
      <span className="font-mono text-[11px] text-foreground truncate">{first}</span>
      {first !== last && (
        <>
          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
          <span className="font-mono text-[11px] text-foreground truncate">{last}</span>
        </>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <MousePointerClick className="size-6 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

function MutedNodeContent({ node, message }: { node: SchemaNode; message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <NodeHeader node={node} />
      <p className="text-sm italic text-muted-foreground">{message}</p>
    </div>
  );
}

export function NodeInspector({ nodeId, nodeVisits, mutedNodeIds, graphNodes }: NodeInspectorProps) {
  const t = useTranslations('dashboard.debug');
  const { first, last } = useMemo(() => deriveEndpoints(nodeVisits), [nodeVisits]);

  const graphNode = useMemo(() => {
    if (nodeId === null) return undefined;
    return graphNodes.find((n) => n.id === nodeId);
  }, [nodeId, graphNodes]);

  const visit = useMemo(() => {
    if (nodeId === null) return undefined;
    return nodeVisits.find((v) => v.node_id === nodeId);
  }, [nodeId, nodeVisits]);

  if (nodeId === null || graphNode === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {first !== undefined && last !== undefined && <ExecutionPath first={first} last={last} />}
        <EmptyState message={t('selectNode')} />
      </div>
    );
  }

  if (mutedNodeIds.has(nodeId)) {
    return <MutedNodeContent node={graphNode} message={t('notVisited')} />;
  }

  if (visit === undefined) {
    return <EmptyState message={t('selectNode')} />;
  }

  return <VisitedNodeDetails node={graphNode} visit={visit} />;
}
