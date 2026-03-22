'use client';

import { useMemo } from 'react';

import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';

import type { Graph } from '@/app/schemas/graph.schema';
import { buildDebugGraph } from '@/app/utils/debugGraphBuilder';
import type { RFEdgeData, RFNodeData } from '@/app/utils/graphTransformers';
import { schemaEdgeToRFEdge, schemaNodeToRFNode } from '@/app/utils/graphTransformers';
import { layoutGraph } from '@/app/utils/layoutGraph';

import { edgeTypes } from '../edges';
import { nodeTypes } from '../nodes';

interface DebugCanvasProps {
  graph: Graph;
  visitedNodeIds: string[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
}

const SELECTED_RING = 'ring-2 ring-primary ring-offset-2';

function buildLayoutedData(graph: Graph, visitedNodeIds: string[]) {
  const debug = buildDebugGraph(graph.nodes, graph.edges, visitedNodeIds);
  const layouted = layoutGraph(debug.nodes, debug.edges);
  return { layouted, mutedNodeIds: debug.mutedNodeIds, mutedEdgeIds: debug.mutedEdgeIds };
}

function toRFNodes(
  layouted: { nodes: Graph['nodes'] },
  mutedNodeIds: Set<string>,
  startNodeId: string,
  selectedNodeId: string | null
) {
  return layouted.nodes.map((node, i) => {
    const rfNode = schemaNodeToRFNode(node, i);
    const isStart = node.id === startNodeId;

    return {
      ...rfNode,
      type: isStart ? 'start' : rfNode.type,
      data: { ...rfNode.data, muted: mutedNodeIds.has(node.id) },
      className: node.id === selectedNodeId ? SELECTED_RING : undefined,
    };
  });
}

function toRFEdges(
  layouted: { nodes: Graph['nodes']; edges: Graph['edges'] },
  mutedEdgeIds: Set<string>
) {
  return layouted.edges.map((edge, i) => {
    const rfEdge = schemaEdgeToRFEdge(edge, i, layouted.nodes);
    const edgeId = `${edge.from}-${edge.to}`;

    return {
      ...rfEdge,
      data: { ...rfEdge.data, muted: mutedEdgeIds.has(edgeId) },
    };
  });
}

function handleNodeClick(
  _: React.MouseEvent,
  node: Node<RFNodeData>,
  onNodeClick: (nodeId: string) => void
) {
  onNodeClick(node.id);
}

export function DebugCanvas({ graph, visitedNodeIds, selectedNodeId, onNodeClick }: DebugCanvasProps) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

  const { nodes, edges } = useMemo(() => {
    const { layouted, mutedNodeIds, mutedEdgeIds } = buildLayoutedData(graph, visitedNodeIds);
    const rfNodes = toRFNodes(layouted, mutedNodeIds, graph.startNode, selectedNodeId);
    const rfEdges = toRFEdges(layouted, mutedEdgeIds);
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph, visitedNodeIds, selectedNodeId]);

  return (
    <div className="relative h-full w-full flex-1 overflow-hidden rounded-lg border">
      <ReactFlow<Node<RFNodeData>, Edge<RFEdgeData>>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        onNodeClick={(e, node) => handleNodeClick(e, node, onNodeClick)}
        deleteKeyCode={null}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        fitView
        colorMode={colorMode}
      >
        <Background color="var(--sidebar-ring)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
