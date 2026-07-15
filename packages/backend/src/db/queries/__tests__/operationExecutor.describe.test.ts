import type { Operation } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../graphQueries.js', () => ({ assembleGraph: jest.fn() }));
jest.unstable_mockModule('../operationDispatch.js', () => ({ executeSingleOperation: jest.fn() }));

const { describeOperation } = await import('../operationExecutor.js');

describe('describeOperation', () => {
  it('formats insertNode/updateNode with the node id', () => {
    const insert: Operation = { type: 'insertNode', data: { nodeId: 'n1', text: 't', kind: 'agent' } };
    const update: Operation = { type: 'updateNode', data: { nodeId: 'n2', text: 't', kind: 'agent' } };
    expect(describeOperation(insert)).toBe('insertNode(n1)');
    expect(describeOperation(update)).toBe('updateNode(n2)');
  });

  it('formats deleteNode with the node id', () => {
    expect(describeOperation({ type: 'deleteNode', nodeId: 'n3' })).toBe('deleteNode(n3)');
  });

  it('formats insertEdge/updateEdge with from->to', () => {
    const insert: Operation = { type: 'insertEdge', data: { from: 'a', to: 'b' } };
    const update: Operation = { type: 'updateEdge', data: { from: 'c', to: 'd' } };
    expect(describeOperation(insert)).toBe('insertEdge(a->b)');
    expect(describeOperation(update)).toBe('updateEdge(c->d)');
  });

  it('formats deleteEdge with from->to', () => {
    expect(describeOperation({ type: 'deleteEdge', from: 'x', to: 'y' })).toBe('deleteEdge(x->y)');
  });

  it('falls back to op.type for other operation types', () => {
    expect(describeOperation({ type: 'updateStartNode', startNode: 'n1' })).toBe('updateStartNode');
    expect(describeOperation({ type: 'insertAgent', data: { agentKey: 'k' } })).toBe('insertAgent');
  });
});
