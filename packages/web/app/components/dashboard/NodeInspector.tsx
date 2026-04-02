'use client';

import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
import { MousePointerClick } from 'lucide-react';
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

  const graphNode = useMemo(() => {
    if (nodeId === null) return undefined;
    return graphNodes.find((n) => n.id === nodeId);
  }, [nodeId, graphNodes]);

  const visit = useMemo(() => {
    if (nodeId === null) return undefined;
    return nodeVisits.find((v) => v.node_id === nodeId);
  }, [nodeId, nodeVisits]);

  if (nodeId === null || graphNode === undefined) {
    return <EmptyState message={t('selectNode')} />;
  }

  if (mutedNodeIds.has(nodeId)) {
    return <MutedNodeContent node={graphNode} message={t('notVisited')} />;
  }

  if (visit === undefined) {
    return <EmptyState message={t('selectNode')} />;
  }

  return <VisitedNodeDetails node={graphNode} visit={visit} />;
}
