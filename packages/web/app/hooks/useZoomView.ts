import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  START_NODE_HEIGHT,
  START_NODE_WIDTH,
} from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { layoutGraph } from '../utils/layoutGraph';

const ZOOM_HORIZONTAL_SPACING = 250;
const ZOOM_VERTICAL_SPACING = 100;
const FIT_PADDING = 0.3;
const FIT_DURATION = 300;
const FIT_DELAY = 50;
const EXIT_DURATION = 300;

type NodeArray = Array<Node<RFNodeData>>;
type EdgeArray = Array<Edge<RFEdgeData>>;

interface SavedGraphState {
  nodes: NodeArray;
  edges: EdgeArray;
  viewport: { x: number; y: number; zoom: number };
}

interface UseZoomViewParams {
  nodes: NodeArray;
  edges: EdgeArray;
  setNodes: (nodes: NodeArray | ((nds: NodeArray) => NodeArray)) => void;
  setEdges: (edges: EdgeArray | ((eds: EdgeArray) => EdgeArray)) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  reactFlow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport' | 'fitView'>;
}

interface UseZoomViewReturn {
  zoomViewNodeId: string | null;
  savedGraphState: SavedGraphState | null;
  handleZoomToNode: (nodeId: string) => void;
  handleExitZoomView: () => void;
}

function getNodeDimension(n: Node<RFNodeData>): { width: number; height: number } {
  const isStart = n.type === 'start';
  return {
    width: isStart ? START_NODE_WIDTH : (n.data.nodeWidth ?? DEFAULT_NODE_WIDTH),
    height: isStart ? START_NODE_HEIGHT : DEFAULT_NODE_HEIGHT,
  };
}

function findConnectedSubgraph(
  nodeId: string,
  sourceNodes: NodeArray,
  sourceEdges: EdgeArray
): { filteredNodes: NodeArray; connectedEdges: EdgeArray } {
  const connectedEdges = sourceEdges.filter((e) => e.source === nodeId || e.target === nodeId);
  const connectedNodeIds = new Set([
    nodeId,
    ...connectedEdges.map((e) => e.source),
    ...connectedEdges.map((e) => e.target),
  ]);
  const filteredNodes = sourceNodes.filter((n) => connectedNodeIds.has(n.id));
  return { filteredNodes, connectedEdges };
}

function buildNodeDimensions(filteredNodes: NodeArray): Record<string, { width: number; height: number }> {
  const dims: Record<string, { width: number; height: number }> = {};
  filteredNodes.forEach((n) => {
    dims[n.id] = getNodeDimension(n);
  });
  return dims;
}

function prepareSchemaData(
  filteredNodes: NodeArray,
  connectedEdges: EdgeArray
): {
  schemaNodes: Array<{ id: string; text: string; description: string; kind: 'agent'; global: boolean }>;
  schemaEdges: Array<{ from: string; to: string }>;
} {
  const schemaNodes = filteredNodes.map((n) => ({
    id: n.id,
    text: n.data.text,
    description: n.data.description,
    kind: 'agent' as const,
    global: n.data.global ?? false,
  }));
  const schemaEdges = connectedEdges.map((e) => ({ from: e.source, to: e.target }));
  return { schemaNodes, schemaEdges };
}

function repositionNodes(
  filteredNodes: NodeArray,
  nodeDimensions: Record<string, { width: number; height: number }>,
  schemaNodes: ReturnType<typeof prepareSchemaData>['schemaNodes'],
  schemaEdges: ReturnType<typeof prepareSchemaData>['schemaEdges']
): NodeArray {
  const layoutResult = layoutGraph(schemaNodes, schemaEdges, {
    rankdir: 'LR',
    horizontalSpacing: ZOOM_HORIZONTAL_SPACING,
    verticalSpacing: ZOOM_VERTICAL_SPACING,
    nodeDimensions,
  });

  return filteredNodes.map((n) => {
    const newPos = layoutResult.nodes.find((ln) => ln.id === n.id)?.position;
    return newPos === undefined ? n : { ...n, position: newPos };
  });
}

interface ZoomViewState {
  savedState: SavedGraphState | null;
  setSavedState: (s: SavedGraphState | null) => void;
  setZoomViewNodeId: (id: string | null) => void;
}

function applyZoomView(nodeId: string, params: UseZoomViewParams, state: ZoomViewState): void {
  const { savedState, setSavedState, setZoomViewNodeId } = state;
  const sourceNodes = savedState?.nodes ?? params.nodes;
  const sourceEdges = savedState?.edges ?? params.edges;

  if (savedState === null) {
    setSavedState({
      nodes: [...params.nodes],
      edges: [...params.edges],
      viewport: params.reactFlow.getViewport(),
    });
  }

  const { filteredNodes, connectedEdges } = findConnectedSubgraph(nodeId, sourceNodes, sourceEdges);
  const nodeDimensions = buildNodeDimensions(filteredNodes);
  const { schemaNodes, schemaEdges } = prepareSchemaData(filteredNodes, connectedEdges);
  const repositioned = repositionNodes(filteredNodes, nodeDimensions, schemaNodes, schemaEdges);

  params.setSelectedNodeId(null);
  params.setSelectedEdgeId(null);
  params.setNodes(repositioned.map((n) => ({ ...n, selected: false })));
  params.setEdges(connectedEdges.map((e) => ({ ...e, selected: false })));
  setZoomViewNodeId(nodeId);

  const { zoom: currentZoom } = params.reactFlow.getViewport();
  setTimeout(() => {
    void params.reactFlow.fitView({ padding: FIT_PADDING, duration: FIT_DURATION, maxZoom: currentZoom });
  }, FIT_DELAY);
}

export function useZoomView(params: UseZoomViewParams): UseZoomViewReturn {
  const [zoomViewNodeId, setZoomViewNodeId] = useState<string | null>(null);
  const [savedGraphState, setSavedGraphState] = useState<SavedGraphState | null>(null);

  const handleZoomToNode = useCallback(
    (nodeId: string) => {
      applyZoomView(nodeId, params, {
        savedState: savedGraphState,
        setSavedState: setSavedGraphState,
        setZoomViewNodeId,
      });
    },
    [params, savedGraphState]
  );

  const handleExitZoomView = useCallback(() => {
    if (savedGraphState !== null) {
      params.setNodes(savedGraphState.nodes);
      params.setEdges(savedGraphState.edges);
      void params.reactFlow.setViewport(savedGraphState.viewport, { duration: EXIT_DURATION });
      setSavedGraphState(null);
      setZoomViewNodeId(null);
    }
  }, [savedGraphState, params]);

  return { zoomViewNodeId, savedGraphState, handleZoomToNode, handleExitZoomView };
}
