import { type Connection, type Edge, type Node, type ReactFlowInstance, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_GAP,
  START_NODE_HEIGHT,
  START_NODE_ID,
  START_NODE_WIDTH,
} from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { NodeKind } from '../utils/nodeKind';
import { buildInsertEdgeOp, buildInsertNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';
import { buildMenuEdgeArg } from './menuEdge';

const NANOID_LENGTH = 8;
const HALF = 2;
const SCREEN_Y_FACTOR = 0.3;
const CENTER_X_OFFSET = 90;
const CENTER_Y_OFFSET = 30;
const HANDLE_OFFSET = 10;

type NodeArray = Array<Node<RFNodeData>>;
type EdgeArray = Array<Edge<RFEdgeData>>;

interface ConnectionMenuState {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string | null;
  addOptionKind?: NodeKind;
}

interface UseGraphActionsParams {
  nodes: NodeArray;
  edges: EdgeArray;
  setNodes: (nodes: NodeArray | ((nds: NodeArray) => NodeArray)) => void;
  setEdges: (edges: EdgeArray | ((eds: EdgeArray) => EdgeArray)) => void;
  setSelectedNodeId: (id: string | null) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
  reactFlow: Pick<ReactFlowInstance, 'screenToFlowPosition' | 'setViewport'>;
  pushOperation: PushOperation;
}

interface UseGraphActionsReturn {
  connectionMenu: ConnectionMenuState | null;
  onConnect: (params: Connection) => void;
  onSourceHandleClick: (nodeId: string, handleId: string, event: React.MouseEvent) => void;
  onAddOption: (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => void;
  handleConnectionMenuSelectNode: (targetNodeId: string) => void;
  handleConnectionMenuCreateNode: () => void;
  handleConnectionMenuClose: () => void;
  handleAddNode: () => void;
}

function computeNewNodePosition(
  menu: ConnectionMenuState,
  sourceNode: Node<RFNodeData> | undefined,
  screenToFlowPosition: ReactFlowInstance['screenToFlowPosition']
): { x: number; y: number } {
  if (sourceNode === undefined) {
    const flowPos = screenToFlowPosition(menu.position);
    return { x: flowPos.x, y: flowPos.y };
  }

  const isStart = sourceNode.type === 'start';
  const srcW = isStart ? START_NODE_WIDTH : (sourceNode.data.nodeWidth ?? DEFAULT_NODE_WIDTH);
  const srcH = isStart ? START_NODE_HEIGHT : DEFAULT_NODE_HEIGHT;

  if (menu.sourceHandleId === 'top-source') {
    return {
      x: sourceNode.position.x + srcW / HALF - DEFAULT_NODE_WIDTH / HALF,
      y: sourceNode.position.y - DEFAULT_NODE_HEIGHT - NODE_GAP,
    };
  }
  if (menu.sourceHandleId === 'bottom-source') {
    return {
      x: sourceNode.position.x + srcW / HALF - DEFAULT_NODE_WIDTH / HALF,
      y: sourceNode.position.y + srcH + NODE_GAP,
    };
  }
  return {
    x: sourceNode.position.x + srcW + NODE_GAP,
    y: sourceNode.position.y + srcH / HALF - DEFAULT_NODE_HEIGHT / HALF,
  };
}

function resolveTargetHandle(sourceHandleId: string | null): string {
  if (sourceHandleId === 'top-source') return 'bottom-target';
  if (sourceHandleId === 'bottom-source') return 'top-target';
  return 'left-target';
}

// Edges are persisted keyed by (from, to) — the DB allows a single edge per
// node pair, and inserting over an existing pair silently replaces its
// preconditions. Creating a second parallel edge in the editor would
// therefore collapse into one corrupted edge on reload, so we block it here.
function edgeExists(edges: EdgeArray, from: string, to: string): boolean {
  return edges.some((e) => e.source === from && e.target === to);
}

function useOnConnect(
  edges: EdgeArray,
  setEdges: UseGraphActionsParams['setEdges'],
  setMenu: (v: ConnectionMenuState | null) => void,
  pushOperation: PushOperation
): (params: Connection) => void {
  const t = useTranslations('editor');

  return useCallback(
    (params: Connection) => {
      if (params.target === START_NODE_ID) return;
      if (params.source === null || params.target === null) return;
      if (edgeExists(edges, params.source, params.target)) {
        toast.warning(t('duplicateEdgeBlocked'));
        setMenu(null);
        return;
      }
      setEdges((eds) => addEdge({ ...params, type: 'precondition' }, eds));
      pushOperation(buildInsertEdgeOp(params.source, params.target));
      setMenu(null);
    },
    [edges, setEdges, setMenu, pushOperation, t]
  );
}

function useSourceHandleClick(
  setMenu: (v: ConnectionMenuState | null) => void
): (nodeId: string, handleId: string, event: React.MouseEvent) => void {
  return useCallback(
    (nodeId: string, handleId: string, event: React.MouseEvent) => {
      const { currentTarget } = event;
      const rect = currentTarget.getBoundingClientRect();
      setMenu({
        position: { x: rect.right + HANDLE_OFFSET, y: rect.top },
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
      });
    },
    [setMenu]
  );
}

function useAddOption(
  setMenu: (v: ConnectionMenuState | null) => void
): (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => void {
  return useCallback(
    (nodeId: string, nodeKind: NodeKind, event: React.MouseEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({
        position: { x: rect.right + HANDLE_OFFSET, y: rect.top },
        sourceNodeId: nodeId,
        sourceHandleId: 'add-option',
        addOptionKind: nodeKind,
      });
    },
    [setMenu]
  );
}

function useMenuSelectNode(
  menu: ConnectionMenuState | null,
  edges: EdgeArray,
  setEdges: UseGraphActionsParams['setEdges'],
  setMenu: (v: ConnectionMenuState | null) => void,
  pushOperation: PushOperation
): (targetNodeId: string) => void {
  const t = useTranslations('editor');

  return useCallback(
    (targetNodeId: string) => {
      if (menu === null) return;
      if (edgeExists(edges, menu.sourceNodeId, targetNodeId)) {
        toast.warning(t('duplicateEdgeBlocked'));
        setMenu(null);
        return;
      }
      const { arg, edgeData } = buildMenuEdgeArg(menu, targetNodeId, 'left-target');
      setEdges((eds) => addEdge(arg, eds));
      pushOperation(buildInsertEdgeOp(menu.sourceNodeId, targetNodeId, edgeData));
      setMenu(null);
    },
    [menu, edges, setEdges, setMenu, pushOperation, t]
  );
}

function useMenuCreateNode(
  params: UseGraphActionsParams,
  menu: ConnectionMenuState | null,
  setMenu: (v: ConnectionMenuState | null) => void
): () => void {
  const { pushOperation } = params;

  return useCallback(() => {
    if (menu === null) return;
    const id = `node_${nanoid(NANOID_LENGTH)}`;
    const sourceNode = params.nodes.find((n) => n.id === menu.sourceNodeId);
    const newPosition = computeNewNodePosition(menu, sourceNode, params.reactFlow.screenToFlowPosition);
    const targetHandle = resolveTargetHandle(menu.sourceHandleId);
    const { arg, edgeData } = buildMenuEdgeArg(menu, id, targetHandle);

    const newNode: Node<RFNodeData> = {
      id,
      type: 'agent',
      position: newPosition,
      data: { nodeId: id, text: '', description: '', nodeWidth: DEFAULT_NODE_WIDTH },
    };

    params.setNodes((nds) => [...nds, newNode]);
    params.setEdges((eds) => addEdge(arg, eds));
    pushOperation(buildInsertNodeOp(newNode));
    pushOperation(buildInsertEdgeOp(menu.sourceNodeId, id, edgeData));
    setMenu(null);
    params.setSelectedNodeId(id);
  }, [menu, params, setMenu, pushOperation]);
}

function useAddNode(params: UseGraphActionsParams): () => void {
  const { reactFlowWrapper, reactFlow, setNodes, setSelectedNodeId, pushOperation } = params;

  return useCallback(() => {
    const id = `node_${nanoid(NANOID_LENGTH)}`;
    const { current: wrapper } = reactFlowWrapper;
    if (wrapper === null) return;

    const rect = wrapper.getBoundingClientRect();
    const screenCenter = { x: rect.left + rect.width / HALF, y: rect.top + rect.height * SCREEN_Y_FACTOR };
    const position = reactFlow.screenToFlowPosition(screenCenter);
    const centeredPosition = { x: position.x - CENTER_X_OFFSET, y: position.y - CENTER_Y_OFFSET };

    const newNode: Node<RFNodeData> = {
      id,
      type: 'agent',
      position: centeredPosition,
      data: {
        nodeId: id,
        text: '',
        description: '',
        nodeWidth: DEFAULT_NODE_WIDTH,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    pushOperation(buildInsertNodeOp(newNode));
    setSelectedNodeId(id);
  }, [reactFlowWrapper, reactFlow, setNodes, setSelectedNodeId, pushOperation]);
}

export function useGraphActions(params: UseGraphActionsParams): UseGraphActionsReturn {
  const [connectionMenu, setConnectionMenu] = useState<ConnectionMenuState | null>(null);

  return {
    connectionMenu,
    onConnect: useOnConnect(params.edges, params.setEdges, setConnectionMenu, params.pushOperation),
    onSourceHandleClick: useSourceHandleClick(setConnectionMenu),
    onAddOption: useAddOption(setConnectionMenu),
    handleConnectionMenuSelectNode: useMenuSelectNode(
      connectionMenu,
      params.edges,
      params.setEdges,
      setConnectionMenu,
      params.pushOperation
    ),
    handleConnectionMenuCreateNode: useMenuCreateNode(params, connectionMenu, setConnectionMenu),
    handleConnectionMenuClose: useCallback(() => {
      setConnectionMenu(null);
    }, []),
    handleAddNode: useAddNode(params),
  };
}
