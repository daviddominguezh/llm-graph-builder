import { describe, expect, it, jest } from '@jest/globals';

import type { Graph } from '../../schemas/graph.schema';

// loadGraphData statically imports ./layoutGraph, which loads the untransformed
// ESM bundle app/lib/dagre.js. calculateNodeDimensions is a pure function that
// never calls layoutGraph, so we stub the module to keep dagre out of the graph.
jest.unstable_mockModule('../layoutGraph', () => ({
  layoutGraph: jest.fn(() => ({ nodes: [], edges: [] })),
}));

const { calculateNodeDimensions } = await import('../loadGraphData.js');

const nodes: Graph['nodes'] = [
  { id: 'A', kind: 'agent_decision', text: '', description: '', global: false },
  { id: 'B', kind: 'agent', text: '', description: '', global: false },
  { id: 'C', kind: 'agent', text: '', description: '', global: false },
];
const edges: Graph['edges'] = [
  { from: 'A', to: 'B', preconditions: [{ type: 'agent_decision', value: 'x' }] },
  { from: 'A', to: 'C', preconditions: [{ type: 'agent_decision', value: 'y' }] },
];

describe('calculateNodeDimensions', () => {
  it('makes a row-mode node taller than a plain node by its option count', () => {
    const dims = calculateNodeDimensions(nodes, edges, 180);
    expect(dims.A?.height).toBeGreaterThan(dims.B?.height ?? 0);
  });
  it('leaves plain nodes at the fixed height', () => {
    const dims = calculateNodeDimensions(nodes, edges, 180);
    expect(dims.B?.height).toBe(dims.C?.height);
  });
});
