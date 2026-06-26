import type { Node } from '@xyflow/react';
import { nanoid } from 'nanoid';

import type { ContextPrecondition } from '../types/contextPrecondition';
import { createEmptyGroup } from '../types/contextPrecondition';
import { DEFAULT_NODE_WIDTH } from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildDeleteNodeOp, buildInsertNodeOp, buildUpdateNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';

const NANOID_LENGTH = 8;
const NAME_SLICE_END = 4;

export type NodeArray = Array<Node<RFNodeData>>;
export type NodeSetter = (nodes: NodeArray | ((nds: NodeArray) => NodeArray)) => void;
export type EdgeSetter = (
  edges:
    | Array<import('@xyflow/react').Edge<RFEdgeData>>
    | ((
        eds: Array<import('@xyflow/react').Edge<RFEdgeData>>
      ) => Array<import('@xyflow/react').Edge<RFEdgeData>>)
) => void;

export interface CtxPreconditionsState {
  customContextPreconditions: ContextPrecondition[];
  setCustomContextPreconditions: React.Dispatch<React.SetStateAction<ContextPrecondition[]>>;
  allContextPreconditions: string[];
}

export function handleGlobalAddNode(setNodes: NodeSetter, pushOp: PushOperation): void {
  const id = `node_${nanoid(NANOID_LENGTH)}`;
  const newNode: Node<RFNodeData> = {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      nodeId: id,
      text: 'New global node',
      description: '',
      global: true,
      nodeWidth: DEFAULT_NODE_WIDTH,
    },
  };
  setNodes((nds) => [...nds, newNode]);
  pushOp(buildInsertNodeOp(newNode));
}

export function handleGlobalUpdateNode(
  nodeId: string,
  updates: Partial<RFNodeData>,
  nodes: NodeArray,
  setNodes: NodeSetter,
  pushOp: PushOperation
): void {
  setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
  const node = nodes.find((n) => n.id === nodeId);
  if (node) {
    const updated: Node<RFNodeData> = { ...node, data: { ...node.data, ...updates } };
    pushOp(buildUpdateNodeOp(updated));
  }
}

export function handleGlobalSetFallback(
  nodeId: string | undefined,
  nodes: NodeArray,
  setNodes: NodeSetter,
  pushOp: PushOperation
): void {
  setNodes((nds) =>
    nds.map((n) => ({
      ...n,
      data: { ...n.data, defaultFallback: n.id === nodeId ? true : undefined },
    }))
  );
  for (const n of nodes) {
    const isNewFallback = n.id === nodeId;
    const wasFallback = n.data.defaultFallback === true;
    if (isNewFallback === wasFallback) continue;
    const updated = { ...n, data: { ...n.data, defaultFallback: isNewFallback ? true : undefined } };
    pushOp(buildUpdateNodeOp(updated));
  }
}

export function handleGlobalDeleteNode(
  nodeId: string,
  setNodes: NodeSetter,
  setEdges: EdgeSetter,
  pushOp: PushOperation
): void {
  setNodes((nds) => nds.filter((n) => n.id !== nodeId));
  setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  pushOp(buildDeleteNodeOp(nodeId));
}

export function handlePreconditionRemove(id: string, ctx: CtxPreconditionsState, setEdges: EdgeSetter): void {
  const target = ctx.customContextPreconditions.find((p) => p.id === id);
  ctx.setCustomContextPreconditions((prev) => prev.filter((p) => p.id !== id));
  if (target === undefined) return;
  setEdges((eds) =>
    eds.map((e) => {
      const cp = e.data?.contextPreconditions;
      if (cp === undefined) return e;
      const filtered = cp.preconditions.filter((p: string) => p !== target.name);
      return {
        ...e,
        data: {
          ...e.data,
          contextPreconditions: filtered.length > 0 ? { ...cp, preconditions: filtered } : undefined,
        },
      };
    })
  );
}

export function handlePreconditionUpdate(
  id: string,
  updates: Partial<ContextPrecondition>,
  ctx: CtxPreconditionsState,
  setEdges: EdgeSetter
): void {
  const old = ctx.customContextPreconditions.find((p) => p.id === id);
  ctx.setCustomContextPreconditions((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  if (updates.name !== undefined && old !== undefined && updates.name !== old.name) {
    setEdges((eds) =>
      eds.map((e) => {
        const cp = e.data?.contextPreconditions;
        if (cp === undefined) return e;
        const renamed = cp.preconditions.map((p: string) => (p === old.name ? updates.name! : p));
        return { ...e, data: { ...e.data, contextPreconditions: { ...cp, preconditions: renamed } } };
      })
    );
  }
}

export function createPrecondition(ctx: CtxPreconditionsState): void {
  const id = nanoid();
  const name = `precondition_${id.slice(0, NAME_SLICE_END)}`;
  ctx.setCustomContextPreconditions((prev) => [...prev, { id, name, root: createEmptyGroup() }]);
}
