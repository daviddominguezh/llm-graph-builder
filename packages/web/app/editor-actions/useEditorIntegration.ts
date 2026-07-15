'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { Connection, Edge, Node } from '@xyflow/react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LoopConnection } from '../components/panels/nodeCreationDialogs/LoopDialog';
import type { EditorHistory, HistorySnapshot } from '../editor-history/historyStore';
import { useGraphHistory } from '../editor-history/useGraphHistory';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { PushOperation } from '../utils/operationBuilders';
import { buildUpdateEdgeOp, buildUpdateNodeOp } from '../utils/operationBuilders';
import type { Dispatch } from './actionRegistry';
import { ActionRegistry } from './actionRegistry';

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

type ParamsRef = RefObject<EditorIntegrationParams>;
type Callbacks = () => EditorCallbacks;

function registerCoreActions(registry: ActionRegistry, cb: Callbacks, undoRef: RefObject<() => void>): void {
  registry.register({
    id: 'history.undo',
    undoable: false,
    run: () => {
      undoRef.current();
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

function registerPropActions(registry: ActionRegistry, paramsRef: ParamsRef): void {
  registry.register<{ nodeId: string }>({
    id: 'node.commitProps',
    undoable: true,
    run: ({ nodeId }) => {
      const n = paramsRef.current.nodes.find((x) => x.id === nodeId);
      if (n !== undefined) paramsRef.current.pushOperation(buildUpdateNodeOp(n));
    },
  });
  registry.register<{ from: string; to: string; data?: RFEdgeData }>({
    id: 'edge.updateProps',
    undoable: true,
    run: ({ from, to, data }) => {
      paramsRef.current.pushOperation(buildUpdateEdgeOp(from, to, data));
    },
  });
}

function buildRegistry(
  history: EditorHistory,
  getState: () => HistorySnapshot,
  paramsRef: ParamsRef,
  undoRef: RefObject<() => void>
): ActionRegistry {
  const registry = new ActionRegistry(history, getState);
  const cb: Callbacks = () => paramsRef.current.callbacks;

  registerCoreActions(registry, cb, undoRef);
  registerMenuBasicActions(registry, cb);
  registerMenuStructuredActions(registry, cb);
  registerPropActions(registry, paramsRef);
  return registry;
}

/**
 * Owns the action registry and undo history for one editor. Registered actions
 * delegate through a latest-value params ref so their closures never go stale.
 * History is FE-only per workflow: it clears on the active→inactive transition
 * (cached editors stay mounted when switching workflows).
 */
export function useEditorIntegration(params: EditorIntegrationParams): EditorIntegration {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [getState] = useState<() => HistorySnapshot>(() => () => ({
    nodes: paramsRef.current.nodes,
    edges: paramsRef.current.edges,
  }));

  const setNodes = useCallback((n: Array<Node<RFNodeData>>) => {
    paramsRef.current.setNodes(n);
  }, []);
  const setEdges = useCallback((e: Array<Edge<RFEdgeData>>) => {
    paramsRef.current.setEdges(e);
  }, []);
  const pushOperation = useCallback<PushOperation>((op) => {
    paramsRef.current.pushOperation(op);
  }, []);

  const { history, undo } = useGraphHistory({ getState, setNodes, setEdges, pushOperation });

  const undoRef = useRef(undo);
  undoRef.current = undo;

  const [registry] = useState(() => buildRegistry(history, getState, paramsRef, undoRef));
  const [dispatch] = useState<Dispatch>(() => registry.dispatch.bind(registry));

  useEffect(() => {
    if (!params.isActiveEditor) history.clear();
  }, [params.isActiveEditor, history]);

  return { dispatch, history, getState };
}
