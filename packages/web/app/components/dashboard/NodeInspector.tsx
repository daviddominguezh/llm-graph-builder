'use client';

import type { NodeVisitRow } from '@/app/lib/dashboard';
import type { Node as SchemaNode } from '@/app/schemas/graph.schema';
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
  return <p className="text-sm text-muted-foreground">{message}</p>;
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
