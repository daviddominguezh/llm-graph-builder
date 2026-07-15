/**
 * @jest-environment jsdom
 */
import type { Operation } from '@daviddh/graph-types';
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { Connection, Edge, Node } from '@xyflow/react';

import type { LoopConnection } from '../../components/panels/nodeCreationDialogs/LoopDialog';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import type { EditorCallbacks, EditorIntegrationParams } from '../useEditorIntegration';
import { useEditorIntegration } from '../useEditorIntegration';

const ORIGIN = 0;
const ONE = 1;
const NONE = 0;

type Hook = ReturnType<typeof useEditorIntegration>;
type CallbackMocks = { [K in keyof EditorCallbacks]: jest.Mock<EditorCallbacks[K]> };

function node(id: string, text: string): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position: { x: ORIGIN, y: ORIGIN },
    data: { nodeId: id, text, description: '' },
  };
}

function noopCallbacks(): EditorCallbacks {
  return {
    handleAddNode: () => undefined,
    onConnect: () => undefined,
    handleConnectionMenuSelectNode: () => undefined,
    handleConnectionMenuCreateNode: () => undefined,
    createUserNode: () => undefined,
    createToolNode: () => undefined,
    createIfElse: () => undefined,
    createLoop: () => undefined,
    confirmDelete: () => undefined,
    requestDeleteSelected: () => undefined,
    toggleSearch: () => undefined,
    closeSearch: () => undefined,
  };
}

function spyCallbacks(): CallbackMocks {
  return {
    handleAddNode: jest.fn<() => void>(),
    onConnect: jest.fn<(params: Connection) => void>(),
    handleConnectionMenuSelectNode: jest.fn<(targetNodeId: string) => void>(),
    handleConnectionMenuCreateNode: jest.fn<() => void>(),
    createUserNode: jest.fn<(value: string) => void>(),
    createToolNode: jest.fn<(tool: SelectedTool) => void>(),
    createIfElse: jest.fn<(branchA: string, branchB: string) => void>(),
    createLoop: jest.fn<(connection: LoopConnection, continueValue: string, exitValue: string) => void>(),
    confirmDelete: jest.fn<() => void>(),
    requestDeleteSelected: jest.fn<() => void>(),
    toggleSearch: jest.fn<() => void>(),
    closeSearch: jest.fn<() => void>(),
  };
}

function setup(nodes: Array<Node<RFNodeData>>): {
  ops: Operation[];
  dispatch: Hook['dispatch'];
} {
  const edges: Array<Edge<RFEdgeData>> = [];
  const ops: Operation[] = [];
  const params: EditorIntegrationParams = {
    nodes,
    edges,
    setNodes: () => undefined,
    setEdges: () => undefined,
    pushOperation: (op) => {
      ops.push(op);
    },
    isActiveEditor: true,
    callbacks: noopCallbacks(),
  };
  const hook = renderHook(() => useEditorIntegration(params));
  return { ops, dispatch: hook.result.current.dispatch };
}

function spySetup(nodes: Array<Node<RFNodeData>>): {
  dispatch: Hook['dispatch'];
  history: Hook['history'];
  callbacks: CallbackMocks;
  ops: Operation[];
} {
  const callbacks = spyCallbacks();
  const ops: Operation[] = [];
  const params: EditorIntegrationParams = {
    nodes,
    edges: [],
    setNodes: () => undefined,
    setEdges: () => undefined,
    pushOperation: (op) => {
      ops.push(op);
    },
    isActiveEditor: true,
    callbacks,
  };
  const { result } = renderHook(() => useEditorIntegration(params));
  return { dispatch: result.current.dispatch, history: result.current.history, callbacks, ops };
}

function committedText(op: Operation | undefined): string | undefined {
  if (op?.type === 'updateNode') return op.data.text;
  return undefined;
}

const CONNECTION: Connection = { source: 's', target: 't', sourceHandle: null, targetHandle: null };
const TOOL: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' };
const LOOP_CONN: LoopConnection = { type: 'user_said', value: 'again', tool: null };

interface DelegationCase {
  id: string;
  param: unknown;
  callback: keyof EditorCallbacks;
  args: unknown[];
  undoable: boolean;
}

const DELEGATION_CASES: DelegationCase[] = [
  { id: 'node.add', param: undefined, callback: 'handleAddNode', args: [], undoable: true },
  { id: 'edge.connect', param: CONNECTION, callback: 'onConnect', args: [CONNECTION], undoable: true },
  { id: 'graph.confirmDelete', param: undefined, callback: 'confirmDelete', args: [], undoable: true },
  {
    id: 'graph.requestDeleteSelected',
    param: undefined,
    callback: 'requestDeleteSelected',
    args: [],
    undoable: false,
  },
  { id: 'search.toggle', param: undefined, callback: 'toggleSearch', args: [], undoable: false },
  { id: 'search.close', param: undefined, callback: 'closeSearch', args: [], undoable: false },
  {
    id: 'menu.selectNode',
    param: 'n1',
    callback: 'handleConnectionMenuSelectNode',
    args: ['n1'],
    undoable: true,
  },
  {
    id: 'menu.createNode',
    param: undefined,
    callback: 'handleConnectionMenuCreateNode',
    args: [],
    undoable: true,
  },
  { id: 'menu.createUserNode', param: 'ask', callback: 'createUserNode', args: ['ask'], undoable: true },
  { id: 'menu.createToolNode', param: TOOL, callback: 'createToolNode', args: [TOOL], undoable: true },
  {
    id: 'menu.createIfElse',
    param: { branchA: 'yes', branchB: 'no' },
    callback: 'createIfElse',
    args: ['yes', 'no'],
    undoable: true,
  },
  {
    id: 'menu.createLoop',
    param: { connection: LOOP_CONN, continueValue: 'go', exitValue: 'stop' },
    callback: 'createLoop',
    args: [LOOP_CONN, 'go', 'stop'],
    undoable: true,
  },
];

interface UndoHarness {
  base: EditorIntegrationParams;
  rerender: (props: EditorIntegrationParams) => void;
  dispatch: Hook['dispatch'];
  history: Hook['history'];
  ops: Operation[];
  setNodesCalls: Array<Array<Node<RFNodeData>>>;
}

function undoHarness(): UndoHarness {
  const ops: Operation[] = [];
  const setNodesCalls: Array<Array<Node<RFNodeData>>> = [];
  const base: EditorIntegrationParams = {
    nodes: [node('a', 'old')],
    edges: [],
    setNodes: (n) => {
      setNodesCalls.push(n);
    },
    setEdges: () => undefined,
    pushOperation: (op) => {
      ops.push(op);
    },
    isActiveEditor: true,
    callbacks: spyCallbacks(),
  };
  const { result, rerender } = renderHook((p: EditorIntegrationParams) => useEditorIntegration(p), {
    initialProps: base,
  });
  const { dispatch, history } = result.current;
  return { base, rerender, dispatch, history, ops, setNodesCalls };
}

describe('useEditorIntegration: action registration table (delegation)', () => {
  it.each(DELEGATION_CASES)('$id delegates to its callback with unwrapped params', (c) => {
    const { dispatch, callbacks } = spySetup([node('a', 'x')]);
    dispatch(c.id, c.param);
    const spy = callbacks[c.callback];
    expect(spy).toHaveBeenCalledTimes(ONE);
    expect(spy.mock.calls[ORIGIN]).toEqual(c.args);
  });
});

describe('useEditorIntegration: history depth per registered action', () => {
  it.each(DELEGATION_CASES)('$id pushes a history entry iff undoable', (c) => {
    const { dispatch, history } = spySetup([node('a', 'x')]);
    expect(history.depth).toBe(NONE);
    dispatch(c.id, c.param);
    expect(history.depth).toBe(c.undoable ? ONE : NONE);
  });
});

describe('useEditorIntegration: node.commitProps explicit updates', () => {
  // Regression: synchronous discrete callers change live state via setNodes,
  // which does not refresh paramsRef.current.nodes until the next render. The
  // op must reflect the change now, not the one-render-stale node.
  it('merges explicit updates over the (still stale) node in params', () => {
    const { ops, dispatch } = setup([node('a', 'old')]);
    dispatch('node.commitProps', { nodeId: 'a', updates: { text: 'new' } });
    expect(ops).toHaveLength(ONE);
    expect(committedText(ops[ORIGIN])).toBe('new');
  });

  it('without updates, emits the current params node data (existing behavior)', () => {
    const { ops, dispatch } = setup([node('a', 'old')]);
    dispatch('node.commitProps', { nodeId: 'a' });
    expect(ops).toHaveLength(ONE);
    expect(committedText(ops[ORIGIN])).toBe('old');
  });

  it('with an unknown nodeId, pushes no op (early return)', () => {
    const { ops, dispatch } = setup([node('a', 'old')]);
    dispatch('node.commitProps', { nodeId: 'missing' });
    expect(ops).toHaveLength(NONE);
  });
});

describe('useEditorIntegration: edge.updateProps', () => {
  it('pushes an updateEdge op for the (from, to) pair', () => {
    const { ops, dispatch } = setup([node('a', 'old')]);
    dispatch('edge.updateProps', { from: 'a', to: 'b' });
    expect(ops).toHaveLength(ONE);
    expect(ops[ORIGIN]?.type).toBe('updateEdge');
  });
});

describe('useEditorIntegration: history.undo delegation', () => {
  const OLD_TEXT = 'old';

  it('restores the pushed snapshot and emits a diff op via pushOperation', () => {
    const h = undoHarness();
    h.dispatch('node.add', undefined);
    expect(h.history.depth).toBe(ONE);
    h.base.nodes = [node('a', 'new')];
    h.rerender(h.base);
    h.dispatch('history.undo', undefined);
    expect(h.history.depth).toBe(NONE);
    expect(h.setNodesCalls).toHaveLength(ONE);
    expect(h.setNodesCalls[ORIGIN]?.[ORIGIN]?.data.text).toBe(OLD_TEXT);
    expect(h.ops.map((o) => o.type)).toContain('updateNode');
  });

  it('is a no-op when the history stack is empty', () => {
    const h = undoHarness();
    h.dispatch('history.undo', undefined);
    expect(h.setNodesCalls).toHaveLength(NONE);
    expect(h.ops).toHaveLength(NONE);
    expect(h.history.depth).toBe(NONE);
  });
});
