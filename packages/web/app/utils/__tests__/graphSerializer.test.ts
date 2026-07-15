import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Edge, Node } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from '../graphTransformers';

// The serializer transitively imports the vendored app/lib/dagre.js (via
// graphInitializer -> loadGraphData -> layoutGraph), which ts-jest does not
// transform. Layout is never executed in these tests, so stub it out.
jest.unstable_mockModule('../../lib/dagre', () => ({ dagre: {} }));

const { START_NODE_ID } = await import('../graphInitializer');
const { serializeGraphData } = await import('../graphSerializer');

function makeNode(id: string, type = 'agent'): Node<RFNodeData> {
  return {
    id,
    type,
    position: { x: 1, y: 2 },
    data: { nodeId: id, text: `text-${id}`, description: `desc-${id}` },
  };
}

function makeEdge(from: string, to: string, data?: RFEdgeData): Edge<RFEdgeData> {
  return { id: `${from}-${to}-0`, source: from, target: to, data };
}

function baseParams() {
  return {
    nodes: [makeNode(START_NODE_ID, 'start'), makeNode('a'), makeNode('b', 'agent_decision')],
    edges: [
      makeEdge(START_NODE_ID, 'a'),
      makeEdge('a', 'b', {
        preconditions: [{ type: 'user_said', value: 'yes', description: 'agreement' }],
      }),
    ],
    agents: [],
    mcpServers: [],
    outputSchemas: [],
  };
}

describe('serializeGraphData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serializes nodes and edges into a schema-valid graph', () => {
    const graph = serializeGraphData(baseParams());

    expect(graph).not.toBeNull();
    expect(graph?.startNode).toBe(START_NODE_ID);
    expect(graph?.nodes.map((n) => n.id)).toEqual([START_NODE_ID, 'a', 'b']);
    expect(graph?.edges.map((e) => `${e.from}->${e.to}`)).toEqual([`${START_NODE_ID}->a`, 'a->b']);
  });

  it('maps react-flow node types onto schema kinds (start -> agent)', () => {
    const graph = serializeGraphData(baseParams());
    expect(graph?.nodes.map((n) => n.kind)).toEqual(['agent', 'agent', 'agent_decision']);
  });

  it('falls back to agent kind for unknown or missing node types', () => {
    const params = baseParams();
    const untyped = { ...makeNode('c'), type: undefined };
    const graph = serializeGraphData({ ...params, nodes: [...params.nodes, untyped] });
    expect(graph?.nodes.at(-1)?.kind).toBe('agent');
  });

  it('preserves node positions and edge preconditions', () => {
    const graph = serializeGraphData(baseParams());
    expect(graph?.nodes[0]?.position).toEqual({ x: 1, y: 2 });
    expect(graph?.edges[1]?.preconditions).toEqual([
      { type: 'user_said', value: 'yes', description: 'agreement' },
    ]);
  });

  it('omits mcpServers and outputSchemas when empty', () => {
    const graph = serializeGraphData(baseParams());
    expect(graph?.mcpServers).toBeUndefined();
    expect(graph?.outputSchemas).toBeUndefined();
  });

  it('includes mcpServers and outputSchemas when present', () => {
    const params = {
      ...baseParams(),
      mcpServers: [
        {
          id: 'srv1',
          name: 'server',
          transport: { type: 'http' as const, url: 'https://example.com/mcp' },
          enabled: true,
        },
      ],
      outputSchemas: [
        { id: 's1', name: 'Lead', fields: [{ name: 'email', type: 'string' as const, required: true }] },
      ],
    };
    const graph = serializeGraphData(params);
    expect(graph?.mcpServers?.[0]?.id).toBe('srv1');
    expect(graph?.outputSchemas?.[0]?.id).toBe('s1');
  });

  it('returns null and logs when the graph fails schema validation', () => {
    const errorSpy = jest.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const params = baseParams();
    const badEdge = makeEdge('a', 'b', {
      preconditions: [
        { type: 'not_a_real_type', value: 'x', description: '' },
      ] as unknown as RFEdgeData['preconditions'],
    });
    const graph = serializeGraphData({ ...params, edges: [badEdge] });

    expect(graph).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
