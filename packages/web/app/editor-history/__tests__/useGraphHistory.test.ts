/**
 * @jest-environment jsdom
 */
import type { Operation } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { RenderHookResult } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';

import { OperationQueueCore } from '../../hooks/operationQueueCore';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import type { EditorHistory } from '../historyStore';
import { useGraphHistory } from '../useGraphHistory';

const ORIGIN = 0;
const FIRST = 0;
const NONE = 0;
const ONE = 1;

interface HistoryHookResult {
  history: EditorHistory;
  undo: () => void;
}

function node(id: string, text = ''): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position: { x: ORIGIN, y: ORIGIN },
    data: { nodeId: id, text, description: '' },
  };
}

function setup(initialNodes: Array<Node<RFNodeData>>): {
  hook: RenderHookResult<HistoryHookResult, unknown>;
  ops: Operation[];
  getNodes: () => Array<Node<RFNodeData>>;
} {
  let nodes = initialNodes;
  let edges: Array<Edge<RFEdgeData>> = [];
  const ops: Operation[] = [];
  const hook = renderHook(() =>
    useGraphHistory({
      getState: () => ({ nodes, edges }),
      setNodes: (n) => {
        nodes = n;
      },
      setEdges: (e) => {
        edges = e;
      },
      pushOperation: (op) => {
        ops.push(op);
      },
    })
  );
  return { hook, ops, getNodes: () => nodes };
}

// Simulated DB: applies node ops in order, keyed by nodeId.
function applyOps(db: Map<string, string>, ops: Operation[]): void {
  for (const op of ops) {
    if (op.type === 'insertNode' || op.type === 'updateNode') db.set(op.data.nodeId, op.data.text);
    if (op.type === 'deleteNode') db.delete(op.nodeId);
  }
}

function makeApplySend(db: Map<string, string>): (ops: Operation[]) => Promise<void> {
  return async (ops) => {
    await Promise.resolve();
    applyOps(db, ops);
  };
}

function makeScenarioHook(
  queue: OperationQueueCore,
  initialNodes: Array<Node<RFNodeData>>
): RenderHookResult<HistoryHookResult, unknown> {
  let nodes = initialNodes;
  let edges: Array<Edge<RFEdgeData>> = [];
  return renderHook(() =>
    useGraphHistory({
      getState: () => ({ nodes, edges }),
      setNodes: (n) => {
        nodes = n;
      },
      setEdges: (e) => {
        edges = e;
      },
      pushOperation: (op) => {
        queue.push(op);
      },
    })
  );
}

async function runConvergenceScenario(flushBetween: boolean): Promise<Map<string, string>> {
  const db = new Map<string, string>();
  db.set('a', '');
  const pendingCounts: number[] = [];
  const queue = new OperationQueueCore(makeApplySend(db), (count) => {
    pendingCounts.push(count);
  });

  const a = node('a');
  const hook = makeScenarioHook(queue, [a, node('b', 'created')]);

  // The original action (create node b) already pushed its op:
  queue.push({ type: 'insertNode', data: { nodeId: 'b', text: 'created', kind: 'agent' } });
  if (flushBetween) await queue.flush(); // scenario 1: original op reached the DB first

  act(() => {
    hook.result.current.history.push({ nodes: [a], edges: [] });
  });
  act(() => {
    hook.result.current.undo();
  });
  await queue.flush();
  return new Map(db);
}

function pushSnapshot(
  hook: RenderHookResult<HistoryHookResult, unknown>,
  nodes: Array<Node<RFNodeData>>
): void {
  act(() => {
    hook.result.current.history.push({ nodes, edges: [] });
  });
}

function runUndo(hook: RenderHookResult<HistoryHookResult, unknown>): void {
  act(() => {
    hook.result.current.undo();
  });
}

function currentHistory(hook: RenderHookResult<HistoryHookResult, unknown>): EditorHistory {
  return hook.result.current.history;
}

describe('useGraphHistory: undo restore', () => {
  it('undo restores the popped snapshot and persists the diff', () => {
    const a = node('a');
    const { hook, ops, getNodes } = setup([a, node('b')]);
    pushSnapshot(hook, [a]);
    runUndo(hook);
    expect(getNodes().map((n) => n.id)).toEqual(['a']);
    expect(ops).toEqual([{ type: 'deleteNode', nodeId: 'b' }]);
  });

  it('untouched nodes stay reference-identical after undo (no full rerender)', () => {
    const a = node('a');
    const { hook, getNodes } = setup([a, node('b')]);
    pushSnapshot(hook, [a]);
    runUndo(hook);
    expect(getNodes()[FIRST]).toBe(a);
  });
});

describe('useGraphHistory: no-op cases', () => {
  it('undo on empty history is a silent no-op', () => {
    const { hook, ops, getNodes } = setup([node('a')]);
    runUndo(hook);
    expect(ops).toHaveLength(NONE);
    expect(getNodes()).toHaveLength(ONE);
  });

  it('identical snapshot produces no ops and no state churn', () => {
    const a = node('a');
    const { hook, ops } = setup([a]);
    pushSnapshot(hook, [a]);
    runUndo(hook);
    expect(ops).toHaveLength(NONE);
  });

  it('history instance is stable across rerenders', () => {
    const { hook } = setup([node('a')]);
    const first = currentHistory(hook);
    hook.rerender();
    expect(currentHistory(hook)).toBe(first);
  });
});

describe('useGraphHistory: queue convergence', () => {
  it('DB converges whether the undone ops were flushed or still queued', async () => {
    const flushedFirst = await runConvergenceScenario(true);
    const queuedTogether = await runConvergenceScenario(false);
    expect(flushedFirst).toEqual(queuedTogether); // both end without node b
    expect(flushedFirst.has('b')).toBe(false);
  });
});
