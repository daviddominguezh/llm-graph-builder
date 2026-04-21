'use client';

import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import { PREV_EXEC_NODE_ID } from '@/app/utils/debugGraphBuilder';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { NodeHeader } from './node-inspector/NodeHeader';
import { VisitedNodeDetails } from './node-inspector/VisitedNodeDetails';

interface NodeInspectorProps {
  nodeId: string | null;
  nodeVisits: NodeVisitRow[];
  mutedNodeIds: Set<string>;
  graphNodes: SchemaNode[];
  prevExecLabel?: string;
  onGoToPrevExec?: () => void;
}

function deriveEndpoints(visits: NodeVisitRow[]): { first: string | undefined; last: string | undefined } {
  if (visits.length === 0) return { first: undefined, last: undefined };
  const first = visits[0]?.node_id;
  const last = visits[visits.length - 1]?.node_id;
  return { first, last };
}

function ExecutionPath({ first, last }: { first: string; last: string }) {
  const t = useTranslations('dashboard.debug');

  return (
    <div className="flex items-center gap-2 rounded-md border border-transparent bg-card px-3 py-2">
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

function PrevExecPanel({ label, onGo }: { label: string; onGo: () => void }) {
  const t = useTranslations('dashboard.debug');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('previousExecution')}
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t('previousExecDescription')}</p>
      <Button variant="outline" size="sm" onClick={onGo} className="w-fit">
        <ArrowLeft className="size-3.5" />
        {t('goToPrevExec')}
      </Button>
    </div>
  );
}

function DefaultPanel({ nodeVisits, message }: { nodeVisits: NodeVisitRow[]; message: string }) {
  const { first, last } = deriveEndpoints(nodeVisits);
  return (
    <div className="flex flex-col gap-3">
      {first !== undefined && last !== undefined && <ExecutionPath first={first} last={last} />}
      <EmptyState message={message} />
    </div>
  );
}

export function NodeInspector({
  nodeId,
  nodeVisits,
  mutedNodeIds,
  graphNodes,
  prevExecLabel,
  onGoToPrevExec,
}: NodeInspectorProps) {
  const t = useTranslations('dashboard.debug');

  const graphNode = useMemo(() => {
    if (nodeId === null) return undefined;
    return graphNodes.find((n) => n.id === nodeId);
  }, [nodeId, graphNodes]);

  const visit = useMemo(() => {
    if (nodeId === null) return undefined;
    return nodeVisits.find((v) => v.node_id === nodeId);
  }, [nodeId, nodeVisits]);

  if (nodeId === PREV_EXEC_NODE_ID && prevExecLabel !== undefined && onGoToPrevExec !== undefined) {
    return <PrevExecPanel label={prevExecLabel} onGo={onGoToPrevExec} />;
  }

  if (nodeId === null || graphNode === undefined) {
    return <DefaultPanel nodeVisits={nodeVisits} message={t('selectNode')} />;
  }

  if (mutedNodeIds.has(nodeId)) {
    return <MutedNodeContent node={graphNode} message={t('notVisited')} />;
  }

  if (visit === undefined) {
    return <EmptyState message={t('selectNode')} />;
  }

  return <VisitedNodeDetails node={graphNode} visit={visit} />;
}
