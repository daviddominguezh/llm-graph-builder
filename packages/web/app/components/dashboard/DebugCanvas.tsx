'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';

import type { Graph, Node as SchemaNode } from '@/app/schemas/graph.schema';
import { buildDebugGraph } from '@/app/utils/debugGraphBuilder';
import type { RFEdgeData, RFNodeData } from '@/app/utils/graphTransformers';
import { schemaEdgeToRFEdge, schemaNodeToRFNode } from '@/app/utils/graphTransformers';
import { layoutGraph } from '@/app/utils/layoutGraph';

import { edgeTypes } from '../edges';
import { nodeTypes } from '../nodes';
import { HandleContext } from '../nodes/HandleContext';

interface DebugCanvasProps {
  graph: Graph;
  visitedNodeIds: string[];
  errorNodeIds: Set<string>;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onDeselectNode: () => void;
}

const readOnlyHandleContext = { readOnly: true };
const CHAR_WIDTH_FACTOR = 7.5;
const NODE_PADDING = 40;
const INITIAL_STEP_ID = 'INITIAL_STEP';
const INITIAL_STEP_WIDTH = 100;
const INITIAL_STEP_HEIGHT = 44;
const NODE_HEIGHT = 220;
const VERTICAL_SPACING = 80;

function calcNodeWidth(nodes: SchemaNode[]): number {
  const maxLen = Math.max(...nodes.map((n) => n.id.length));
  return maxLen * CHAR_WIDTH_FACTOR + NODE_PADDING;
}

function calcNodeDimensions(nodes: SchemaNode[], width: number): Record<string, { width: number; height: number }> {
  const dims: Record<string, { width: number; height: number }> = {};
  for (const node of nodes) {
    dims[node.id] =
      node.id === INITIAL_STEP_ID ? { width: INITIAL_STEP_WIDTH, height: INITIAL_STEP_HEIGHT } : { width, height: NODE_HEIGHT };
  }
  return dims;
}

function buildLayoutedData(graph: Graph, visitedNodeIds: string[], errorNodeIds: Set<string>) {
  const debug = buildDebugGraph(graph.nodes, graph.edges, visitedNodeIds, errorNodeIds);
  const nodeWidth = calcNodeWidth(debug.nodes);
  const layouted = layoutGraph(debug.nodes, debug.edges, {
    horizontalSpacing: nodeWidth,
    verticalSpacing: VERTICAL_SPACING,
    defaultNodeWidth: nodeWidth,
    defaultNodeHeight: NODE_HEIGHT,
    nodeDimensions: calcNodeDimensions(debug.nodes, nodeWidth),
    rankdir: 'LR',
  });
  return { layouted, nodeWidth, mutedNodeIds: debug.mutedNodeIds, mutedEdgeIds: debug.mutedEdgeIds, errorNodeIds };
}

function toRFNodes(
  layouted: { nodes: Graph['nodes'] },
  mutedNodeIds: Set<string>,
  errors: Set<string>,
  startNodeId: string,
  selectedNodeId: string | null,
  nodeWidth: number
) {
  return layouted.nodes.map((node, i) => {
    const rfNode = schemaNodeToRFNode(node, i);
    const isStart = node.id === startNodeId;

    const isMuted = mutedNodeIds.has(node.id);

    return {
      ...rfNode,
      type: isStart ? 'start' : rfNode.type,
      data: {
        ...rfNode.data,
        muted: isMuted,
        hasError: errors.has(node.id),
        nodeWidth,
      },
      selected: node.id === selectedNodeId,
      selectable: !isMuted,
      focusable: !isMuted,
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

    const isMuted = mutedEdgeIds.has(edgeId);

    return {
      ...rfEdge,
      data: { ...rfEdge.data, muted: isMuted },
      selectable: !isMuted,
      focusable: !isMuted,
    };
  });
}

function handleNodeClick(
  _: React.MouseEvent,
  node: Node<RFNodeData>,
  onNodeClick: (nodeId: string) => void
) {
  if (node.data.muted) return;
  onNodeClick(node.id);
}

export function DebugCanvas({
  graph,
  visitedNodeIds,
  errorNodeIds,
  selectedNodeId,
  onNodeClick,
  onDeselectNode,
}: DebugCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => { setMounted(true); });
    return () => { cancelAnimationFrame(id); };
  }, []);
  const colorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  const { nodes, edges } = useMemo(() => {
    const { layouted, nodeWidth, mutedNodeIds, mutedEdgeIds, errorNodeIds: errors } = buildLayoutedData(
      graph,
      visitedNodeIds,
      errorNodeIds
    );
    const rfNodes = toRFNodes(layouted, mutedNodeIds, errors, graph.startNode, selectedNodeId, nodeWidth);
    const rfEdges = toRFEdges(layouted, mutedEdgeIds);
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph, visitedNodeIds, errorNodeIds, selectedNodeId]);

  return (
    <HandleContext.Provider value={readOnlyHandleContext}>
      <div className="relative h-full w-full flex-1 overflow-hidden rounded-md border">
        <ReactFlow<Node<RFNodeData>, Edge<RFEdgeData>>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          onNodeClick={(e, node) => handleNodeClick(e, node, onNodeClick)}
          onPaneClick={onDeselectNode}
          deleteKeyCode={null}
          fitView
          colorMode={colorMode}
        >
          <Background color="var(--canvas-dots)" />
          <Controls />
        </ReactFlow>
      </div>
    </HandleContext.Provider>
  );
}
