import type { Edge, Node } from '@xyflow/react';

import { pushRenameNode } from '../components/panels/nodePanelOps';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { ActionRegistry } from './actionRegistry';
import type { Callbacks, EditorContextHolder } from './useEditorIntegration';

/** Rewrites an edge's endpoints (and derived id) when a node is renamed. */
function remapEdgeForRename(e: Edge<RFEdgeData>, oldId: string, newId: string): Edge<RFEdgeData> {
  const source = e.source === oldId ? newId : e.source;
  const target = e.target === oldId ? newId : e.target;
  return { ...e, id: `${source}-${target}`, source, target };
}

/**
 * Renames a node in place: updates the node and its connected edges in local
 * state and pushes the equivalent persistence ops. Runs inside a dispatched
 * `node.rename` action, so the registry has already snapshotted the pre-rename
 * state — one ⌘Z restores the whole mutation.
 */
function runRename(holder: EditorContextHolder, oldId: string, newId: string): void {
  const params = holder.getParams();
  const node = params.nodes.find((n) => n.id === oldId);
  if (node === undefined) return;
  const renamedNode: Node<RFNodeData> = { ...node, id: newId, data: { ...node.data, nodeId: newId } };
  params.setNodes(params.nodes.map((n) => (n.id === oldId ? renamedNode : n)));
  params.setEdges(params.edges.map((e) => remapEdgeForRename(e, oldId, newId)));
  pushRenameNode(oldId, renamedNode, params.edges, params.pushOperation);
}

export interface RenameParams {
  oldId: string;
  newId: string;
}

export interface DeleteNodeParams {
  nodeId: string;
}

export interface DeleteEdgeParams {
  edgeId: string;
  from: string;
  to: string;
}

/**
 * Structural side-panel mutations (rename, delete, edge type change) registered
 * as undoable actions so ⌘Z reverts them instead of an older unrelated action.
 * Each is exactly one undo entry; the snapshot wraps the full mutation.
 */
export function registerPanelActions(
  registry: ActionRegistry,
  cb: Callbacks,
  holder: EditorContextHolder
): void {
  registry.register<RenameParams>({
    id: 'node.rename',
    undoable: true,
    run: ({ oldId, newId }) => {
      runRename(holder, oldId, newId);
    },
  });
  registry.register<DeleteNodeParams>({
    id: 'node.deleteFromPanel',
    undoable: true,
    run: ({ nodeId }) => {
      cb().deleteNode(nodeId);
    },
  });
  registry.register<DeleteEdgeParams>({
    id: 'edge.deleteFromPanel',
    undoable: true,
    run: ({ edgeId, from, to }) => {
      cb().deleteEdge(edgeId, from, to);
    },
  });
  // The type-change mutation is entangled with panel-local UI state, so the
  // panel supplies the graph mutation as a callback the action wraps.
  registry.register<{ run: () => void }>({
    id: 'edge.changeType',
    undoable: true,
    run: ({ run }) => {
      run();
    },
  });
}
