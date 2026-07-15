import { describe, expect, it } from '@jest/globals';
import type { Node } from '@xyflow/react';

import type { RFNodeData } from '../graphTransformers';
import {
  buildDeleteEdgeOp,
  buildDeleteNodeOp,
  buildDeleteOutputSchemaOp,
  buildInsertEdgeOp,
  buildInsertNodeOp,
  buildInsertOutputSchemaOp,
  buildUpdateEdgeOp,
  buildUpdateNodeOp,
  buildUpdateOutputSchemaOp,
} from '../operationBuilders';

function makeNode(overrides?: Partial<Node<RFNodeData>>): Node<RFNodeData> {
  return {
    id: 'node_1',
    type: 'agent',
    position: { x: 10, y: 20 },
    data: {
      nodeId: 'node_1',
      text: 'Greet the user',
      description: 'greeting step',
      global: true,
      outputSchemaId: 'schema_1',
      outputPrompt: 'extract name',
    },
    ...overrides,
  };
}

describe('node operation builders', () => {
  it('buildInsertNodeOp maps all node fields including position', () => {
    const op = buildInsertNodeOp(makeNode());
    expect(op).toEqual({
      type: 'insertNode',
      data: {
        nodeId: 'node_1',
        text: 'Greet the user',
        kind: 'agent',
        description: 'greeting step',
        agent: undefined,
        nextNodeIsUser: undefined,
        fallbackNodeId: undefined,
        global: true,
        defaultFallback: undefined,
        outputSchemaId: 'schema_1',
        outputPrompt: 'extract name',
        position: { x: 10, y: 20 },
      },
    });
  });

  it('buildUpdateNodeOp maps agent_decision kind', () => {
    const op = buildUpdateNodeOp(makeNode({ type: 'agent_decision' }));
    expect(op.type).toBe('updateNode');
    if (op.type === 'updateNode') expect(op.data.kind).toBe('agent_decision');
  });

  it('buildInsertNodeOp defaults unknown react-flow types to agent kind', () => {
    const op = buildInsertNodeOp(makeNode({ type: 'start' }));
    if (op.type === 'insertNode') expect(op.data.kind).toBe('agent');
  });

  it('buildDeleteNodeOp carries the node id', () => {
    expect(buildDeleteNodeOp('node_9')).toEqual({ type: 'deleteNode', nodeId: 'node_9' });
  });
});

describe('edge operation builders', () => {
  const preconditions = [{ type: 'user_said' as const, value: 'yes', description: 'agreement' }];

  it('buildInsertEdgeOp maps from/to and edge data', () => {
    const op = buildInsertEdgeOp('a', 'b', { preconditions });
    expect(op).toEqual({
      type: 'insertEdge',
      data: { from: 'a', to: 'b', preconditions, contextPreconditions: undefined },
    });
  });

  it('buildInsertEdgeOp without data leaves preconditions undefined', () => {
    const op = buildInsertEdgeOp('a', 'b');
    if (op.type === 'insertEdge') expect(op.data.preconditions).toBeUndefined();
  });

  it('buildUpdateEdgeOp maps contextPreconditions', () => {
    const contextPreconditions = { preconditions: ['ctx.ready'], jumpTo: 'node_2' };
    const op = buildUpdateEdgeOp('a', 'b', { contextPreconditions });
    if (op.type === 'updateEdge') expect(op.data.contextPreconditions).toEqual(contextPreconditions);
  });

  it('buildDeleteEdgeOp carries from/to', () => {
    expect(buildDeleteEdgeOp('a', 'b')).toEqual({ type: 'deleteEdge', from: 'a', to: 'b' });
  });
});

describe('output schema operation builders', () => {
  const fields = [{ name: 'name', type: 'string' as const, required: true, description: 'user name' }];

  it('buildInsertOutputSchemaOp maps id, name and fields', () => {
    expect(buildInsertOutputSchemaOp('s1', 'Lead', fields)).toEqual({
      type: 'insertOutputSchema',
      data: { schemaId: 's1', name: 'Lead', fields },
    });
  });

  it('buildUpdateOutputSchemaOp maps id, name and fields', () => {
    expect(buildUpdateOutputSchemaOp('s1', 'Lead2', fields)).toEqual({
      type: 'updateOutputSchema',
      data: { schemaId: 's1', name: 'Lead2', fields },
    });
  });

  it('buildDeleteOutputSchemaOp carries the schema id', () => {
    expect(buildDeleteOutputSchemaOp('s1')).toEqual({ type: 'deleteOutputSchema', schemaId: 's1' });
  });
});
