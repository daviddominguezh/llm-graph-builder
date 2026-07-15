'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { Connection, Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';

import type { LoopConnection } from '../components/panels/nodeCreationDialogs/LoopDialog';
import type { EditorHistory, HistorySnapshot } from '../editor-history/historyStore';
import { useGraphHistory } from '../editor-history/useGraphHistory';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { PushOperation } from '../utils/operationBuilders';
import { buildUpdateEdgeOp, buildUpdateNodeOp } from '../utils/operationBuilders';
import type { Dispatch } from './actionRegistry';
import { ActionRegistry } from './actionRegistry';
import { registerPanelActions } from './panelActions';

/** Bundled params for the multi-argument connection-menu creators. */
export interface IfElseParams {
  branchA: string;
  branchB: string;
}

export interface LoopParams {
  connection: LoopConnection;
  continueValue: string;
  exitValue: string;
}

export interface EditorCallbacks {
  handleAddNode: () => void;
  onConnect: (params: Connection) => void;
  handleConnectionMenuSelectNode: (targetNodeId: string) => void;
  handleConnectionMenuCreateNode: () => void;
  createUserNode: (value: string) => void;
  createToolNode: (tool: SelectedTool) => void;
  createIfElse: (branchA: string, branchB: string) => void;
  createLoop: (connection: LoopConnection, continueValue: string, exitValue: string) => void;
  confirmDelete: () => void;
  requestDeleteSelected: () => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string, from: string, to: string) => void;
  toggleSearch: () => void;
  closeSearch: () => void;
}

export interface EditorIntegrationParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  setNodes: (nodes: Array<Node<RFNodeData>>) => void;
  setEdges: (edges: Array<Edge<RFEdgeData>>) => void;
  pushOperation: PushOperation;
  isActiveEditor: boolean;
  callbacks: EditorCallbacks;
}

export interface EditorIntegration {
  dispatch: Dispatch;
  history: EditorHistory;
  getState: () => HistorySnapshot;
}

export type Callbacks = () => EditorCallbacks;

const NOOP_UNDO = (): void => undefined;

/**
 * Mutable holder for the latest editor params and undo fn. Kept as a plain
 * class instance (mutated via `set*` from effects, never a captured ref object)
 * so registered action closures read fresh values without tripping the
 * ref-in-render lint rules — same pattern as OperationQueueCore.
 */
export class EditorContextHolder {
  private params: EditorIntegrationParams;
  private undoFn: () => void = NOOP_UNDO;

  constructor(params: EditorIntegrationParams) {
    this.params = params;
  }

  setParams(params: EditorIntegrationParams): void {
    this.params = params;
  }

  getParams(): EditorIntegrationParams {
    return this.params;
  }

  setUndo(undo: () => void): void {
    this.undoFn = undo;
  }

  undo(): void {
    this.undoFn();
  }
}

function registerCoreActions(registry: ActionRegistry, cb: Callbacks, holder: EditorContextHolder): void {
  registry.register({
    id: 'history.undo',
    undoable: false,
    run: () => {
      holder.undo();
    },
  });
  registry.register({
    id: 'node.add',
    undoable: true,
    run: () => {
      cb().handleAddNode();
    },
  });
  registry.register<Connection>({
    id: 'edge.connect',
    undoable: true,
    run: (p) => {
      cb().onConnect(p);
    },
  });
  registry.register({
    id: 'graph.confirmDelete',
    undoable: true,
    run: () => {
      cb().confirmDelete();
    },
  });
}

function registerShortcutActions(registry: ActionRegistry, cb: Callbacks): void {
  // Non-undoable: requestDeleteSelected only opens the confirm dialog — the
  // mutation lives in the undoable graph.confirmDelete. Search toggling is UI
  // state, not graph history.
  registry.register({
    id: 'graph.requestDeleteSelected',
    undoable: false,
    run: () => {
      cb().requestDeleteSelected();
    },
  });
  registry.register({
    id: 'search.toggle',
    undoable: false,
    run: () => {
      cb().toggleSearch();
    },
  });
  registry.register({
    id: 'search.close',
    undoable: false,
    run: () => {
      cb().closeSearch();
    },
  });
}

function registerMenuBasicActions(registry: ActionRegistry, cb: Callbacks): void {
  registry.register<string>({
    id: 'menu.selectNode',
    undoable: true,
    run: (id) => {
      cb().handleConnectionMenuSelectNode(id);
    },
  });
  registry.register({
    id: 'menu.createNode',
    undoable: true,
    run: () => {
      cb().handleConnectionMenuCreateNode();
    },
  });
  registry.register<string>({
    id: 'menu.createUserNode',
    undoable: true,
    run: (v) => {
      cb().createUserNode(v);
    },
  });
  registry.register<SelectedTool>({
    id: 'menu.createToolNode',
    undoable: true,
    run: (t) => {
      cb().createToolNode(t);
    },
  });
}

function registerMenuStructuredActions(registry: ActionRegistry, cb: Callbacks): void {
  registry.register<IfElseParams>({
    id: 'menu.createIfElse',
    undoable: true,
    run: ({ branchA, branchB }) => {
      cb().createIfElse(branchA, branchB);
    },
  });
  registry.register<LoopParams>({
    id: 'menu.createLoop',
    undoable: true,
    run: ({ connection, continueValue, exitValue }) => {
      cb().createLoop(connection, continueValue, exitValue);
    },
  });
}

function registerPropActions(registry: ActionRegistry, holder: EditorContextHolder): void {
  registry.register<{ nodeId: string; updates?: Partial<RFNodeData> }>({
    id: 'node.commitProps',
    undoable: true,
    run: ({ nodeId, updates }) => {
      const n = holder.getParams().nodes.find((x) => x.id === nodeId);
      if (n === undefined) return;
      // Synchronous discrete callers pass `updates` so the op reflects the
      // change immediately, before React re-renders and refreshes `nodes`.
      // Debounced text commits omit it (a re-render already flushed the edit).
      const committed = updates === undefined ? n : { ...n, data: { ...n.data, ...updates } };
      holder.getParams().pushOperation(buildUpdateNodeOp(committed));
    },
  });
  registry.register<{ from: string; to: string; data?: RFEdgeData }>({
    id: 'edge.updateProps',
    undoable: true,
    run: ({ from, to, data }) => {
      holder.getParams().pushOperation(buildUpdateEdgeOp(from, to, data));
    },
  });
}

function buildRegistry(
  history: EditorHistory,
  getState: () => HistorySnapshot,
  holder: EditorContextHolder
): ActionRegistry {
  const registry = new ActionRegistry(history, getState);
  const cb: Callbacks = () => holder.getParams().callbacks;

  registerCoreActions(registry, cb, holder);
  registerShortcutActions(registry, cb);
  registerMenuBasicActions(registry, cb);
  registerMenuStructuredActions(registry, cb);
  registerPropActions(registry, holder);
  registerPanelActions(registry, cb, holder);
  return registry;
}

/**
 * Owns the action registry and undo history for one editor. Registered actions
 * delegate through a latest-value params ref so their closures never go stale.
 * History is FE-only per workflow: it clears on the active→inactive transition
 * (cached editors stay mounted when switching workflows).
 */
export function useEditorIntegration(params: EditorIntegrationParams): EditorIntegration {
  const [holder] = useState(() => new EditorContextHolder(params));

  useEffect(() => {
    holder.setParams(params);
  });

  const [getState] = useState<() => HistorySnapshot>(() => () => ({
    nodes: holder.getParams().nodes,
    edges: holder.getParams().edges,
  }));

  const setNodes = useCallback(
    (n: Array<Node<RFNodeData>>) => {
      holder.getParams().setNodes(n);
    },
    [holder]
  );
  const setEdges = useCallback(
    (e: Array<Edge<RFEdgeData>>) => {
      holder.getParams().setEdges(e);
    },
    [holder]
  );
  const pushOperation = useCallback<PushOperation>(
    (op) => {
      holder.getParams().pushOperation(op);
    },
    [holder]
  );

  const { history, undo } = useGraphHistory({ getState, setNodes, setEdges, pushOperation });

  useEffect(() => {
    holder.setUndo(undo);
  }, [holder, undo]);

  const [registry] = useState(() => buildRegistry(history, getState, holder));
  const [dispatch] = useState<Dispatch>(() => registry.dispatch.bind(registry));

  useEffect(() => {
    if (!params.isActiveEditor) history.clear();
  }, [params.isActiveEditor, history]);

  return { dispatch, history, getState };
}
