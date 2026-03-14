import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  START_NODE_HEIGHT,
  START_NODE_ID,
} from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

const HALF = 2;
const PAN_DURATION = 300;

interface UseGraphSelectionParams {
  nodes: Array<Node<RFNodeData>>;
  setNodes: (
    nodes: Array<Node<RFNodeData>> | ((nds: Array<Node<RFNodeData>>) => Array<Node<RFNodeData>>)
  ) => void;
  setEdges: (
    edges: Array<Edge<RFEdgeData>> | ((eds: Array<Edge<RFEdgeData>>) => Array<Edge<RFEdgeData>>)
  ) => void;
  reactFlow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
}

export interface UseGraphSelectionReturn {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  onNodeClick: (_: React.MouseEvent, node: Node) => void;
  onEdgeClick: (_: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  handleSearchSelectNode: (targetNodeId: string) => void;
  navigateToNode: (targetNodeId: string) => void;
  selectEdge: (edgeId: string) => void;
}

interface PanelCloseState {
  setGlobalPanelOpen: (v: boolean) => void;
  setPresetsOpen: (v: boolean) => void;
  setToolsOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setLibraryOpen: (v: boolean) => void;
}

function centerViewOnNode(
  node: Node<RFNodeData>,
  wrapper: HTMLDivElement,
  reactFlow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>
): void {
  const nodeWidth = node.data.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = node.type === 'start' ? START_NODE_HEIGHT : DEFAULT_NODE_HEIGHT;
  const { zoom } = reactFlow.getViewport();
  const { width, height } = wrapper.getBoundingClientRect();

  void reactFlow.setViewport(
    {
      x: width / HALF - (node.position.x + nodeWidth / HALF) * zoom,
      y: height / HALF - (node.position.y + nodeHeight / HALF) * zoom,
      zoom,
    },
    { duration: PAN_DURATION }
  );
}

function useClickHandlers(
  setSelectedNodeId: (id: string | null) => void,
  setSelectedEdgeId: (id: string | null) => void,
  panels: PanelCloseState
): Pick<UseGraphSelectionReturn, 'onNodeClick' | 'onEdgeClick' | 'onPaneClick'> {
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === START_NODE_ID) return;
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      panels.setGlobalPanelOpen(false);
      panels.setPresetsOpen(false);
      panels.setToolsOpen(false);
    },
    [setSelectedNodeId, setSelectedEdgeId, panels]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
      panels.setToolsOpen(false);
    },
    [setSelectedEdgeId, setSelectedNodeId, panels]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    panels.setGlobalPanelOpen(false);
    panels.setPresetsOpen(false);
    panels.setToolsOpen(false);
    panels.setSearchOpen(false);
    panels.setLibraryOpen(false);
  }, [setSelectedNodeId, setSelectedEdgeId, panels]);

  return { onNodeClick, onEdgeClick, onPaneClick };
}

function useSelectEdge(
  setNodes: UseGraphSelectionParams['setNodes'],
  setEdges: UseGraphSelectionParams['setEdges'],
  setSelectedEdgeId: (id: string | null) => void,
  setSelectedNodeId: (id: string | null) => void
): (edgeId: string) => void {
  return useCallback(
    (edgeId: string) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edgeId })));
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, setSelectedEdgeId, setSelectedNodeId]
  );
}

function useNavigationCallbacks(
  params: UseGraphSelectionParams,
  setSelectedNodeId: (id: string | null) => void,
  setSelectedEdgeId: (id: string | null) => void,
  panels: PanelCloseState
): Pick<UseGraphSelectionReturn, 'handleSearchSelectNode' | 'navigateToNode'> {
  const { nodes, setNodes, setEdges, reactFlow, reactFlowWrapper } = params;

  const handleSearchSelectNode = useCallback(
    (targetNodeId: string) => {
      const node = nodes.find((n) => n.id === targetNodeId);
      if (node !== undefined && reactFlowWrapper.current !== null) {
        centerViewOnNode(node, reactFlowWrapper.current, reactFlow);
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === targetNodeId })));
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      setSelectedNodeId(targetNodeId);
      setSelectedEdgeId(null);
      panels.setGlobalPanelOpen(false);
      panels.setPresetsOpen(false);
    },
    [nodes, reactFlow, reactFlowWrapper, setNodes, setEdges, setSelectedNodeId, setSelectedEdgeId, panels]
  );

  const navigateToNode = useCallback(
    (targetNodeId: string) => {
      const node = nodes.find((n) => n.id === targetNodeId);
      if (node !== undefined && reactFlowWrapper.current !== null) {
        centerViewOnNode(node, reactFlowWrapper.current, reactFlow);
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === targetNodeId })));
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      setSelectedNodeId(targetNodeId);
      setSelectedEdgeId(null);
    },
    [nodes, reactFlow, reactFlowWrapper, setNodes, setEdges, setSelectedNodeId, setSelectedEdgeId]
  );

  return { handleSearchSelectNode, navigateToNode };
}

export function useGraphSelection(
  params: UseGraphSelectionParams,
  panels: PanelCloseState
): UseGraphSelectionReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const clicks = useClickHandlers(setSelectedNodeId, setSelectedEdgeId, panels);
  const navigation = useNavigationCallbacks(params, setSelectedNodeId, setSelectedEdgeId, panels);
  const selectEdge = useSelectEdge(params.setNodes, params.setEdges, setSelectedEdgeId, setSelectedNodeId);

  return {
    selectedNodeId,
    selectedEdgeId,
    setSelectedNodeId,
    setSelectedEdgeId,
    ...clicks,
    ...navigation,
    selectEdge,
  };
}
