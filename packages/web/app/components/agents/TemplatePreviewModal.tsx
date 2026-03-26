'use client';

import { getTemplateSnapshot } from '@/app/lib/templates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { TemplateGraphData } from '@daviddh/graph-types';
import { Background, Controls, type Edge, type Node, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  version: number | null;
}

type PreviewNodeData = Record<string, unknown> & {
  label: string;
  kind: string;
  description: string;
};

type PreviewEdgeData = Record<string, unknown> & {
  label: string;
};

const DEFAULT_POSITION = { x: 0, y: 0 };

/* ------------------------------------------------------------------ */
/*  Conversion helpers                                                 */
/* ------------------------------------------------------------------ */

function buildEdgeLabel(
  preconditions: Array<{ type: string; value: string; description?: string }> | undefined
): string {
  if (!preconditions || preconditions.length === 0) return '';
  return preconditions.map((p) => p.value).join(', ');
}

function toPreviewNodes(graphData: TemplateGraphData): Array<Node<PreviewNodeData>> {
  return graphData.nodes.map((node) => ({
    id: node.id,
    position: node.position ?? DEFAULT_POSITION,
    data: { label: node.text, kind: node.kind, description: node.description },
    type: 'default',
  }));
}

function toPreviewEdges(graphData: TemplateGraphData): Array<Edge<PreviewEdgeData>> {
  return graphData.edges.map((edge, index) => ({
    id: `e-${String(index)}`,
    source: edge.from,
    target: edge.to,
    label: buildEdgeLabel(edge.preconditions),
  }));
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

function PreviewGraph({
  nodes,
  edges,
  colorMode,
}: {
  nodes: Array<Node<PreviewNodeData>>;
  edges: Array<Edge<PreviewEdgeData>>;
  colorMode: 'dark' | 'light';
}) {
  return (
    <div className="min-h-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        fitView
        colorMode={colorMode}
      >
        <Background color="var(--canvas-dots)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TemplatePreviewModal({ open, onOpenChange, agentId, version }: TemplatePreviewModalProps) {
  const t = useTranslations('marketplace');
  const tCommon = useTranslations('common');
  const { resolvedTheme } = useTheme();
  const [graphData, setGraphData] = useState<TemplateGraphData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !agentId || version === null) return;
    setLoading(true);
    setGraphData(null);
    getTemplateSnapshot(agentId, version).then((result) => {
      setGraphData(result.graphData);
      setLoading(false);
    });
  }, [open, agentId, version]);

  const nodes = graphData ? toPreviewNodes(graphData) : [];
  const edges = graphData ? toPreviewEdges(graphData) : [];
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-4xl flex-col p-0 h-[600px]">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t('previewTitle')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <LoadingState message={tCommon('loading')} />
        ) : (
          <PreviewGraph nodes={nodes} edges={edges} colorMode={colorMode} />
        )}
      </DialogContent>
    </Dialog>
  );
}
