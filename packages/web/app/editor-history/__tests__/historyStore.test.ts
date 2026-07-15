import { describe, expect, it } from '@jest/globals';
import type { Node } from '@xyflow/react';

import type { RFNodeData } from '../../utils/graphTransformers';
import { EditorHistory } from '../historyStore';

const ORIGIN = 0;
const FIRST = 0;
const EMPTY = 0;
const ONE = 1;
const TWO = 2;
const FOUR = 4;

function node(id: string): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position: { x: ORIGIN, y: ORIGIN },
    data: { nodeId: id, text: '', description: '' },
  };
}

describe('EditorHistory: stack semantics', () => {
  it('pushes and pops entries LIFO', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('a')], edges: [] });
    h.push({ nodes: [node('a'), node('b')], edges: [] });
    expect(h.depth).toBe(TWO);
    expect(h.pop()?.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(h.pop()?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(h.pop()).toBeUndefined();
  });

  it('stores shallow copies: mutating the pushed array later does not affect the entry', () => {
    const h = new EditorHistory();
    const nodes = [node('a')];
    h.push({ nodes, edges: [] });
    nodes.push(node('b'));
    expect(h.pop()?.nodes).toHaveLength(ONE);
  });

  it('preserves object references inside snapshots (structural sharing)', () => {
    const h = new EditorHistory();
    const a = node('a');
    h.push({ nodes: [a], edges: [] });
    expect(h.pop()?.nodes[FIRST]).toBe(a);
  });

  it('caps at the given size, dropping oldest', () => {
    const h = new EditorHistory(TWO);
    h.push({ nodes: [node('1')], edges: [] });
    h.push({ nodes: [node('2')], edges: [] });
    h.push({ nodes: [node('3')], edges: [] });
    expect(h.depth).toBe(TWO);
    expect(h.pop()?.nodes[FIRST]?.id).toBe('3');
    expect(h.pop()?.nodes[FIRST]?.id).toBe('2');
  });
});

describe('EditorHistory: coalescing and clearing', () => {
  it('coalesces consecutive entries with the same coalesceKey (oldest pre-state wins)', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('before-typing')], edges: [], coalesceKey: 'node.commitProps:a:text#1' });
    h.push({ nodes: [node('mid-typing')], edges: [], coalesceKey: 'node.commitProps:a:text#1' });
    expect(h.depth).toBe(ONE);
    expect(h.pop()?.nodes[FIRST]?.id).toBe('before-typing');
  });

  it('does not coalesce different keys or undefined keys', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('1')], edges: [], coalesceKey: 'k#1' });
    h.push({ nodes: [node('2')], edges: [], coalesceKey: 'k#2' });
    h.push({ nodes: [node('3')], edges: [] });
    h.push({ nodes: [node('4')], edges: [] });
    expect(h.depth).toBe(FOUR);
  });

  it('clear empties the stack', () => {
    const h = new EditorHistory();
    h.push({ nodes: [node('a')], edges: [] });
    h.clear();
    expect(h.depth).toBe(EMPTY);
    expect(h.pop()).toBeUndefined();
  });
});
