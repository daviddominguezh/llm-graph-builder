import { type Edge, type Node, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import type { Precondition } from '../schemas/graph.schema';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, NODE_GAP } from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildInsertEdgeOp, buildInsertNodeOp, buildUpdateNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';

const NANOID_LENGTH = 8;
const HALF = 2;

interface ConnectionMenuState {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string | null;
}

interface StructuredCreationParams {
  nodes: Array<Node<RFNodeData>>;
  setNodes: (
    nodes: Array<Node<RFNodeData>> | ((nds: Array<Node<RFNodeData>>) => Array<Node<RFNodeData>>)
  ) => void;
  setEdges: (
    edges: Array<Edge<RFEdgeData>> | ((eds: Array<Edge<RFEdgeData>>) => Array<Edge<RFEdgeData>>)
  ) => void;
  setSelectedNodeId: (id: string | null) => void;
  pushOperation: PushOperation;
  menu: ConnectionMenuState | null;
  closeMenu: () => void;
}

function makeNodeId(): string {
  return `node_${nanoid(NANOID_LENGTH)}`;
}

function makeNode(id: string, position: { x: number; y: number }, description: string): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position,
    data: { nodeId: id, text: '', description, nodeWidth: DEFAULT_NODE_WIDTH },
  };
}

function resolveTargetHandle(sourceHandleId: string | null): string {
  if (sourceHandleId === 'top-source') return 'bottom-target';
  if (sourceHandleId === 'bottom-source') return 'top-target';
  return 'left-target';
}

function getBasePosition(sourceNode: Node<RFNodeData>): { x: number; y: number } {
  const srcW = sourceNode.data.nodeWidth ?? DEFAULT_NODE_WIDTH;
  return {
    x: sourceNode.position.x + srcW + NODE_GAP,
    y: sourceNode.position.y,
  };
}

function buildEdgeParams(
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string,
  precondition?: Precondition
): {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string;
  type: string;
  data?: RFEdgeData;
} {
  const data: RFEdgeData | undefined = precondition ? { preconditions: [precondition] } : undefined;
  return { source, target, sourceHandle, targetHandle, type: 'precondition', data };
}

function updateNextNodeIsUser(params: StructuredCreationParams, sourceNode: Node<RFNodeData>): void {
  const updated: Node<RFNodeData> = {
    ...sourceNode,
    data: { ...sourceNode.data, nextNodeIsUser: true },
  };
  params.setNodes((nds) => nds.map((n) => (n.id === sourceNode.id ? updated : n)));
  params.pushOperation(buildUpdateNodeOp(updated));
}

export function useCreateUserNode(params: StructuredCreationParams): (userSaidValue: string) => void {
  return useCallback(
    (userSaidValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const id = makeNodeId();
      const position = getBasePosition(sourceNode);
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);
      const precondition: Precondition = { type: 'user_said', value: userSaidValue };
      const newNode = makeNode(id, position, '');

      params.setNodes((nds) => [...nds, newNode]);
      params.setEdges((eds) =>
        addEdge(
          buildEdgeParams(
            params.menu!.sourceNodeId,
            id,
            params.menu!.sourceHandleId,
            targetHandle,
            precondition
          ),
          eds
        )
      );
      params.pushOperation(buildInsertNodeOp(newNode));
      params.pushOperation(
        buildInsertEdgeOp(params.menu!.sourceNodeId, id, { preconditions: [precondition] })
      );
      updateNextNodeIsUser(params, sourceNode);
      params.setSelectedNodeId(id);
      params.closeMenu();
    },
    [params]
  );
}

export function useCreateToolNode(params: StructuredCreationParams): (toolName: string) => void {
  return useCallback(
    (toolName: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const id = makeNodeId();
      const position = getBasePosition(sourceNode);
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);
      const precondition: Precondition = { type: 'tool_call', value: toolName };
      const newNode = makeNode(id, position, '');

      params.setNodes((nds) => [...nds, newNode]);
      params.setEdges((eds) =>
        addEdge(
          buildEdgeParams(
            params.menu!.sourceNodeId,
            id,
            params.menu!.sourceHandleId,
            targetHandle,
            precondition
          ),
          eds
        )
      );
      params.pushOperation(buildInsertNodeOp(newNode));
      params.pushOperation(
        buildInsertEdgeOp(params.menu!.sourceNodeId, id, { preconditions: [precondition] })
      );
      params.setSelectedNodeId(id);
      params.closeMenu();
    },
    [params]
  );
}

export function useCreateIfElse(
  params: StructuredCreationParams
): (branchAValue: string, branchBValue: string) => void {
  return useCallback(
    (branchAValue: string, branchBValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const idA = makeNodeId();
      const idB = makeNodeId();
      const base = getBasePosition(sourceNode);
      const verticalOffset = (DEFAULT_NODE_HEIGHT + NODE_GAP) / HALF;
      const posA = { x: base.x, y: base.y - verticalOffset };
      const posB = { x: base.x, y: base.y + verticalOffset };
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);

      const preconditionA: Precondition = { type: 'agent_decision', value: branchAValue };
      const preconditionB: Precondition = { type: 'agent_decision', value: branchBValue };
      const nodeA = makeNode(idA, posA, 'Branch A');
      const nodeB = makeNode(idB, posB, 'Branch B');

      params.setNodes((nds) => [...nds, nodeA, nodeB]);
      params.setEdges((eds) => {
        let next = addEdge(
          buildEdgeParams(
            params.menu!.sourceNodeId,
            idA,
            params.menu!.sourceHandleId,
            targetHandle,
            preconditionA
          ),
          eds
        );
        next = addEdge(
          buildEdgeParams(
            params.menu!.sourceNodeId,
            idB,
            params.menu!.sourceHandleId,
            targetHandle,
            preconditionB
          ),
          next
        );
        return next;
      });
      params.pushOperation(buildInsertNodeOp(nodeA));
      params.pushOperation(buildInsertNodeOp(nodeB));
      params.pushOperation(
        buildInsertEdgeOp(params.menu!.sourceNodeId, idA, { preconditions: [preconditionA] })
      );
      params.pushOperation(
        buildInsertEdgeOp(params.menu!.sourceNodeId, idB, { preconditions: [preconditionB] })
      );
      params.setSelectedNodeId(idA);
      params.closeMenu();
    },
    [params]
  );
}

interface LoopConnection {
  type: 'none' | 'user_said' | 'tool_call';
  value: string;
}

export function useCreateLoop(
  params: StructuredCreationParams
): (connection: LoopConnection, continueValue: string, exitValue: string) => void {
  return useCallback(
    (connection: LoopConnection, continueValue: string, exitValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const loopId = makeNodeId();
      const exitId = makeNodeId();
      const base = getBasePosition(sourceNode);
      const exitPos = { x: base.x + DEFAULT_NODE_WIDTH + NODE_GAP, y: base.y };
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);

      const loopNode = makeNode(loopId, base, 'Loop Body');
      const exitNode = makeNode(exitId, exitPos, 'Exit');

      // Edge: source -> loop body
      const connPrecondition: Precondition | undefined =
        connection.type === 'none' ? undefined : { type: connection.type, value: connection.value };
      const connEdgeData: RFEdgeData | undefined = connPrecondition
        ? { preconditions: [connPrecondition] }
        : undefined;

      // Edge: loop body -> source (back-edge)
      const continuePrecondition: Precondition = { type: 'agent_decision', value: continueValue };
      // Edge: loop body -> exit
      const exitPrecondition: Precondition = { type: 'agent_decision', value: exitValue };

      params.setNodes((nds) => [...nds, loopNode, exitNode]);
      params.setEdges((eds) => {
        let next = addEdge(
          buildEdgeParams(
            params.menu!.sourceNodeId,
            loopId,
            params.menu!.sourceHandleId,
            targetHandle,
            connPrecondition
          ),
          eds
        );
        next = addEdge(
          buildEdgeParams(
            loopId,
            params.menu!.sourceNodeId,
            'right-source',
            'left-target',
            continuePrecondition
          ),
          next
        );
        next = addEdge(
          buildEdgeParams(loopId, exitId, 'bottom-source', 'top-target', exitPrecondition),
          next
        );
        return next;
      });

      params.pushOperation(buildInsertNodeOp(loopNode));
      params.pushOperation(buildInsertNodeOp(exitNode));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, loopId, connEdgeData));
      params.pushOperation(
        buildInsertEdgeOp(loopId, params.menu!.sourceNodeId, { preconditions: [continuePrecondition] })
      );
      params.pushOperation(buildInsertEdgeOp(loopId, exitId, { preconditions: [exitPrecondition] }));

      if (connection.type === 'user_said') {
        updateNextNodeIsUser(params, sourceNode);
      }
      params.setSelectedNodeId(loopId);
      params.closeMenu();
    },
    [params]
  );
}
