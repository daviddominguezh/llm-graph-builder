import type { Edge, Node } from '@xyflow/react';
import { useCallback, useState } from 'react';

import { pushDeleteEdge } from '../components/panels/edgePanelOps';
import { pushDeleteNode } from '../components/panels/nodePanelOps';
import { START_NODE_ID } from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { PushOperation } from '../utils/operationBuilders';

type NodeSetter = (fn: (nds: Array<Node<RFNodeData>>) => Array<Node<RFNodeData>>) => void;
type EdgeSetter = (fn: (eds: Array<Edge<RFEdgeData>>) => Array<Edge<RFEdgeData>>) => void;

export type PendingDeleteTarget =
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string; from: string; to: string };

interface UseDeleteConfirmationParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  setNodes: NodeSetter;
  setEdges: EdgeSetter;
  pushOperation: PushOperation;
  onNodeDeleted?: () => void;
  onEdgeDeleted?: () => void;
}

export interface UseDeleteConfirmationReturn {
  pendingDelete: PendingDeleteTarget | null;
  confirmDelete: () => void;
  cancelDelete: () => void;
  requestDeleteEdge: (edgeId: string, from: string, to: string) => void;
  requestDeleteSelected: () => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string, from: string, to: string) => void;
}

/** Shared node-deletion mutation: used by both the confirm dialog and panel actions. */
function runDeleteNode(
  nodeId: string,
  setNodes: NodeSetter,
  setEdges: EdgeSetter,
  pushOperation: PushOperation,
  onNodeDeleted?: () => void
): void {
  setNodes((nds) => nds.filter((n) => n.id !== nodeId));
  setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  pushDeleteNode(nodeId, pushOperation);
  onNodeDeleted?.();
}

/** Shared edge-deletion mutation: used by both the confirm dialog and panel actions. */
function runDeleteEdge(
  edgeId: string,
  from: string,
  to: string,
  setEdges: EdgeSetter,
  pushOperation: PushOperation,
  onEdgeDeleted?: () => void
): void {
  setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  pushDeleteEdge(from, to, pushOperation);
  onEdgeDeleted?.();
}

function findSelectedNode(nodes: Array<Node<RFNodeData>>): Node<RFNodeData> | undefined {
  return nodes.find((n) => n.selected === true && n.id !== START_NODE_ID);
}

function findSelectedEdge(edges: Array<Edge<RFEdgeData>>): Edge<RFEdgeData> | undefined {
  return edges.find((e) => e.selected === true);
}

export function useDeleteConfirmation(params: UseDeleteConfirmationParams): UseDeleteConfirmationReturn {
  const { nodes, edges, setNodes, setEdges, pushOperation, onNodeDeleted, onEdgeDeleted } = params;

  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);

  const requestDeleteSelected = useCallback(() => {
    const selectedNode = findSelectedNode(nodes);
    if (selectedNode !== undefined) {
      setPendingDelete({ kind: 'node', nodeId: selectedNode.id });
      return;
    }
    const selectedEdge = findSelectedEdge(edges);
    if (selectedEdge !== undefined) {
      setPendingDelete({
        kind: 'edge',
        edgeId: selectedEdge.id,
        from: selectedEdge.source,
        to: selectedEdge.target,
      });
    }
  }, [nodes, edges]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      runDeleteNode(nodeId, setNodes, setEdges, pushOperation, onNodeDeleted);
    },
    [setNodes, setEdges, pushOperation, onNodeDeleted]
  );

  const deleteEdge = useCallback(
    (edgeId: string, from: string, to: string) => {
      runDeleteEdge(edgeId, from, to, setEdges, pushOperation, onEdgeDeleted);
    },
    [setEdges, pushOperation, onEdgeDeleted]
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target === null) return;
    if (target.kind === 'node') deleteNode(target.nodeId);
    else deleteEdge(target.edgeId, target.from, target.to);
  }, [pendingDelete, deleteNode, deleteEdge]);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const requestDeleteEdge = useCallback((edgeId: string, from: string, to: string) => {
    setPendingDelete({ kind: 'edge', edgeId, from, to });
  }, []);

  return {
    pendingDelete,
    confirmDelete,
    cancelDelete,
    requestDeleteEdge,
    requestDeleteSelected,
    deleteNode,
    deleteEdge,
  };
}
