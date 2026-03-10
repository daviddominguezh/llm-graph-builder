import { type Connection, type Edge, type Node, type ReactFlowInstance, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_GAP,
  START_NODE_HEIGHT,
  START_NODE_ID,
  START_NODE_WIDTH,
} from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildInsertEdgeOp, buildInsertNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';

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

function useOnConnect(
  setEdges: UseGraphActionsParams['setEdges'],
  setMenu: (v: ConnectionMenuState | null) => void,
  pushOperation: PushOperation
): (params: Connection) => void {
  return useCallback(
    (params: Connection) => {
      if (params.target === START_NODE_ID) return;
      setEdges((eds) => addEdge({ ...params, type: 'precondition' }, eds));
      pushOperation(buildInsertEdgeOp(params.source, params.target));
      setMenu(null);
    },
    [setEdges, setMenu, pushOperation]
  );
}

function useSourceHandleClick(
  edges: EdgeArray,
  setMenu: (v: ConnectionMenuState | null) => void
): (nodeId: string, handleId: string, event: React.MouseEvent) => void {
  return useCallback(
    (nodeId: string, handleId: string, event: React.MouseEvent) => {
      if (nodeId === START_NODE_ID && edges.some((e) => e.source === START_NODE_ID)) {
        return;
      }
      const { currentTarget } = event;
      const rect = currentTarget.getBoundingClientRect();
      setMenu({
        position: { x: rect.right + HANDLE_OFFSET, y: rect.top },
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
      });
    },
    [edges, setMenu]
  );
}

function useMenuSelectNode(
  menu: ConnectionMenuState | null,
  setEdges: UseGraphActionsParams['setEdges'],
  setMenu: (v: ConnectionMenuState | null) => void,
  pushOperation: PushOperation
): (targetNodeId: string) => void {
  return useCallback(
    (targetNodeId: string) => {
      if (menu === null) return;
      setEdges((eds) =>
        addEdge(
          {
            source: menu.sourceNodeId,
            target: targetNodeId,
            sourceHandle: menu.sourceHandleId,
            targetHandle: 'left-target',
            type: 'precondition',
          },
          eds
        )
      );
      pushOperation(buildInsertEdgeOp(menu.sourceNodeId, targetNodeId));
      setMenu(null);
    },
    [menu, setEdges, setMenu, pushOperation]
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

    const newNode: Node<RFNodeData> = {
      id,
      type: 'agent',
      position: newPosition,
      data: { nodeId: id, text: '', description: '', nodeWidth: DEFAULT_NODE_WIDTH },
    };

    params.setNodes((nds) => [...nds, newNode]);
    params.setEdges((eds) =>
      addEdge(
        {
          source: menu.sourceNodeId,
          target: id,
          sourceHandle: menu.sourceHandleId,
          targetHandle,
          type: 'precondition',
        },
        eds
      )
    );
    pushOperation(buildInsertNodeOp(newNode));
    pushOperation(buildInsertEdgeOp(menu.sourceNodeId, id));
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
    onConnect: useOnConnect(params.setEdges, setConnectionMenu, params.pushOperation),
    onSourceHandleClick: useSourceHandleClick(params.edges, setConnectionMenu),
    handleConnectionMenuSelectNode: useMenuSelectNode(
      connectionMenu,
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
