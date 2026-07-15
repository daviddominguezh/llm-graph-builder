import { describe, expect, it } from '@jest/globals';
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { diffGraphStates } from '../graphDiff';

const ORIGIN = 0;
const EDGE_INDEX = 0;
const ONE = 1;
const FIRST = 0;
const SECOND = 1;

function node(id: string, text = ''): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position: { x: ORIGIN, y: ORIGIN },
    data: { nodeId: id, text, description: '' },
  };
}

function edge(from: string, to: string, data?: RFEdgeData): Edge<RFEdgeData> {
  return { id: `${from}-${to}-${EDGE_INDEX}`, source: from, target: to, data };
}

describe('diffGraphStates: nodes', () => {
  it('returns no ops for identical states (shared references)', () => {
    const a = node('a');
    const e = edge('a', 'a');
    const state = { nodes: [a], edges: [e] };
    expect(diffGraphStates(state, { nodes: [a], edges: [e] })).toEqual([]);
  });

  it('emits insertNode for nodes only in after (undo of a delete)', () => {
    const a = node('a');
    const ops = diffGraphStates({ nodes: [], edges: [] }, { nodes: [a], edges: [] });
    expect(ops).toHaveLength(ONE);
    expect(ops[FIRST]).toMatchObject({ type: 'insertNode', data: { nodeId: 'a' } });
  });

  it('emits deleteNode for nodes only in before (undo of a create)', () => {
    const ops = diffGraphStates({ nodes: [node('a')], edges: [] }, { nodes: [], edges: [] });
    expect(ops).toEqual([{ type: 'deleteNode', nodeId: 'a' }]);
  });

  it('emits updateNode when the node object changed', () => {
    const ops = diffGraphStates(
      { nodes: [node('a', 'new text')], edges: [] },
      { nodes: [node('a', 'old text')], edges: [] }
    );
    expect(ops).toHaveLength(ONE);
    expect(ops[FIRST]).toMatchObject({ type: 'updateNode', data: { nodeId: 'a', text: 'old text' } });
  });
});

describe('diffGraphStates: edges and ordering', () => {
  it('restores edges alongside their restored node, nodes first', () => {
    const a = node('a');
    const b = node('b');
    const ab = edge('a', 'b', { preconditions: [{ type: 'user_said', value: 'hi', description: '' }] });
    const ops = diffGraphStates({ nodes: [a], edges: [] }, { nodes: [a, b], edges: [ab] });
    expect(ops.map((o) => o.type)).toEqual(['insertNode', 'insertEdge']);
    expect(ops[SECOND]).toMatchObject({ type: 'insertEdge', data: { from: 'a', to: 'b' } });
  });

  it('emits deleteEdge before node deletes for removed edges (undo of a connect)', () => {
    const a = node('a');
    const b = node('b');
    const ab = edge('a', 'b');
    const ops = diffGraphStates({ nodes: [a, b], edges: [ab] }, { nodes: [a], edges: [] });
    expect(ops.map((o) => o.type)).toEqual(['deleteEdge', 'deleteNode']);
  });

  it('emits updateEdge when edge data changed (undo of a precondition edit)', () => {
    const a = node('a');
    const b = node('b');
    const beforeEdge = edge('a', 'b', { preconditions: [] });
    const afterEdge = edge('a', 'b', {
      preconditions: [{ type: 'user_said', value: 'yes', description: '' }],
    });
    const ops = diffGraphStates(
      { nodes: [a, b], edges: [beforeEdge] },
      { nodes: [a, b], edges: [afterEdge] }
    );
    expect(ops).toHaveLength(ONE);
    expect(ops[FIRST]).toMatchObject({
      type: 'updateEdge',
      data: { from: 'a', to: 'b', preconditions: [{ type: 'user_said', value: 'yes' }] },
    });
  });
});

describe('diffGraphStates: rename', () => {
  it('handles a rename (delete old id + insert new id + reconnect edges)', () => {
    const a = node('a');
    const renamed = node('a2');
    const ops = diffGraphStates(
      { nodes: [renamed], edges: [edge('a2', 'a2')] },
      { nodes: [a], edges: [edge('a', 'a')] }
    );
    const types = ops.map((o) => o.type).sort();
    expect(types).toEqual(['deleteEdge', 'deleteNode', 'insertEdge', 'insertNode']);
  });
});
