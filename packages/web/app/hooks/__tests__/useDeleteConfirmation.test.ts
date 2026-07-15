/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';

// This jsdom suite resolves @xyflow/react to its untransformed ESM build (the
// node-env suites hit the CJS build and never trip). The hook only reaches
// @xyflow's `Position` enum at runtime (via graphTransformers), so stub it.
jest.unstable_mockModule('@xyflow/react', () => ({
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
}));

// The hook transitively imports the vendored app/lib/dagre.js (via
// graphInitializer -> loadGraphData -> layoutGraph), which ts-jest does not
// transform. Layout never runs here, so stub it out. Same convention as
// graphSerializer.test.
jest.unstable_mockModule('../../lib/dagre', () => ({ dagre: {} }));

const { START_NODE_ID } = await import('../../utils/graphInitializer');
const { useDeleteConfirmation } = await import('../useDeleteConfirmation');

const ORIGIN = 0;

function node(id: string, selected: boolean): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position: { x: ORIGIN, y: ORIGIN },
    selected,
    data: { nodeId: id, text: '', description: '' },
  };
}

function edge(id: string, selected: boolean): Edge<RFEdgeData> {
  return { id, source: `${id}-src`, target: `${id}-tgt`, selected };
}

interface SetupParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
}

function setup(
  params: SetupParams
): ReturnType<typeof renderHook<ReturnType<typeof useDeleteConfirmation>, void>> {
  return renderHook(() =>
    useDeleteConfirmation({
      nodes: params.nodes,
      edges: params.edges,
      setNodes: () => undefined,
      setEdges: () => undefined,
      pushOperation: () => undefined,
    })
  );
}

describe('useDeleteConfirmation.requestDeleteSelected', () => {
  it('selects a node over an edge when both are selected', () => {
    const hook = setup({ nodes: [node('n1', true)], edges: [edge('e1', true)] });
    act(() => hook.result.current.requestDeleteSelected());
    expect(hook.result.current.pendingDelete).toEqual({ kind: 'node', nodeId: 'n1' });
  });

  it('excludes the start node from node selection', () => {
    const hook = setup({ nodes: [node(START_NODE_ID, true)], edges: [] });
    act(() => hook.result.current.requestDeleteSelected());
    expect(hook.result.current.pendingDelete).toBeNull();
  });

  it('is a no-op when nothing is selected', () => {
    const hook = setup({ nodes: [node('n1', false)], edges: [edge('e1', false)] });
    act(() => hook.result.current.requestDeleteSelected());
    expect(hook.result.current.pendingDelete).toBeNull();
  });

  it('sets pendingDelete with id/from/to for a selected edge', () => {
    const hook = setup({ nodes: [], edges: [edge('e1', true)] });
    act(() => hook.result.current.requestDeleteSelected());
    expect(hook.result.current.pendingDelete).toEqual({
      kind: 'edge',
      edgeId: 'e1',
      from: 'e1-src',
      to: 'e1-tgt',
    });
  });
});
