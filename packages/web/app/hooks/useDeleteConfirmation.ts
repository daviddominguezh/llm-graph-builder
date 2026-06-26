import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';

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
}

function isEditingText(): boolean {
  const el = document.activeElement;
  if (el === null) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

const DELETE_KEYS = new Set(['Delete', 'Backspace']);

function findSelectedNode(nodes: Array<Node<RFNodeData>>): Node<RFNodeData> | undefined {
  return nodes.find((n) => n.selected === true && n.id !== START_NODE_ID);
}

function findSelectedEdge(edges: Array<Edge<RFEdgeData>>): Edge<RFEdgeData> | undefined {
  return edges.find((e) => e.selected === true);
}

export function useDeleteConfirmation(params: UseDeleteConfirmationParams): UseDeleteConfirmationReturn {
  const { nodes, edges, setNodes, setEdges, pushOperation, onNodeDeleted, onEdgeDeleted } = params;

  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!DELETE_KEYS.has(e.key)) return;
      if (isEditingText()) return;

      const selectedNode = findSelectedNode(nodes);
      if (selectedNode !== undefined) {
        e.preventDefault();
        setPendingDelete({ kind: 'node', nodeId: selectedNode.id });
        return;
      }

      const selectedEdge = findSelectedEdge(edges);
      if (selectedEdge !== undefined) {
        e.preventDefault();
        setPendingDelete({
          kind: 'edge',
          edgeId: selectedEdge.id,
          from: selectedEdge.source,
          to: selectedEdge.target,
        });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes, edges]);

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target === null) return;

    if (target.kind === 'node') {
      setNodes((nds) => nds.filter((n) => n.id !== target.nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== target.nodeId && e.target !== target.nodeId));
      pushDeleteNode(target.nodeId, pushOperation);
      onNodeDeleted?.();
    } else {
      setEdges((eds) => eds.filter((e) => e.id !== target.edgeId));
      pushDeleteEdge(target.from, target.to, pushOperation);
      onEdgeDeleted?.();
    }
  }, [pendingDelete, setNodes, setEdges, pushOperation, onNodeDeleted, onEdgeDeleted]);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  return { pendingDelete, confirmDelete, cancelDelete };
}
