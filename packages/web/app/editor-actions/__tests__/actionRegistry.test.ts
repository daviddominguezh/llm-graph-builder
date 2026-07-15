import { describe, expect, it, jest } from '@jest/globals';

import { EditorHistory } from '../../editor-history/historyStore';
import type { HistorySnapshot } from '../../editor-history/historyStore';
import { ActionRegistry } from '../actionRegistry';

const ORIGIN = 0;
const FIRST = 0;
const EMPTY = 0;
const ONE = 1;

function makeRegistry(state: HistorySnapshot = { nodes: [], edges: [] }): {
  history: EditorHistory;
  registry: ActionRegistry;
} {
  const history = new EditorHistory();
  const registry = new ActionRegistry(history, () => state);
  return { history, registry };
}

describe('ActionRegistry: dispatch and params', () => {
  it('dispatch runs the registered action with params', () => {
    const { registry } = makeRegistry();
    const run = jest.fn();
    registry.register<{ nodeId: string }>({ id: 'node.delete', undoable: true, run });
    registry.dispatch('node.delete', { nodeId: 'a' });
    expect(run).toHaveBeenCalledWith({ nodeId: 'a' });
  });

  it('throws on duplicate registration and unknown dispatch', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'a', undoable: false, run: () => undefined });
    expect(() => {
      registry.register({ id: 'a', undoable: false, run: () => undefined });
    }).toThrow('a');
    expect(() => {
      registry.dispatch('missing', undefined);
    }).toThrow('missing');
  });
});

describe('ActionRegistry: history snapshotting', () => {
  it('snapshots state BEFORE running an undoable action', () => {
    const state: HistorySnapshot = { nodes: [], edges: [] };
    const { registry, history } = makeRegistry(state);
    registry.register({
      id: 'mutate',
      undoable: true,
      run: () => {
        expect(history.depth).toBe(ONE);
      },
    });
    registry.dispatch('mutate', undefined);
    expect(history.depth).toBe(ONE);
  });

  it('does not snapshot non-undoable actions', () => {
    const { registry, history } = makeRegistry();
    registry.register({ id: 'search.toggle', undoable: false, run: () => undefined });
    registry.dispatch('search.toggle', undefined);
    expect(history.depth).toBe(EMPTY);
  });

  it('uses preState override and coalesceKey when provided', () => {
    const { registry, history } = makeRegistry({ nodes: [], edges: [] });
    const preState: HistorySnapshot = {
      nodes: [
        { id: 'x', position: { x: ORIGIN, y: ORIGIN }, data: { nodeId: 'x', text: '', description: '' } },
      ],
      edges: [],
    };
    registry.register({ id: 'node.commitProps', undoable: true, run: () => undefined });
    registry.dispatch('node.commitProps', undefined, { preState, coalesceKey: 'k#1' });
    registry.dispatch('node.commitProps', undefined, { preState, coalesceKey: 'k#1' });
    expect(history.depth).toBe(ONE);
    expect(history.pop()?.nodes[FIRST]?.id).toBe('x');
  });
});
