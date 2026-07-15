/**
 * @jest-environment jsdom
 */
import type { Operation } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import type { EditorCallbacks, EditorIntegrationParams } from '../useEditorIntegration';
import { useEditorIntegration } from '../useEditorIntegration';

const ORIGIN = 0;
const ONE = 1;

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
  };
}

function setup(nodes: Array<Node<RFNodeData>>): {
  ops: Operation[];
  dispatch: ReturnType<typeof useEditorIntegration>['dispatch'];
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

function committedText(op: Operation | undefined): string | undefined {
  if (op?.type === 'updateNode') return op.data.text;
  return undefined;
}

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
});
