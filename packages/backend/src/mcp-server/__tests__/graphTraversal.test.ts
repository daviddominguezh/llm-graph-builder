import type { Graph } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import {
  bfsReachability,
  findShortestPath,
  getDeadEndNodes,
  getOrphanNodeIds,
} from '../services/graphTraversal.js';

/* ------------------------------------------------------------------ */
/*  Shared graph fixtures                                              */
/* ------------------------------------------------------------------ */

const LINEAR_GRAPH: Graph = {
  startNode: 'A',
  agents: [],
  nodes: [
    { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
    { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
    { id: 'C', text: 'C', kind: 'agent', description: '', global: false },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
  ],
};

const BRANCHING_GRAPH: Graph = {
  startNode: 'A',
  agents: [],
  nodes: [
    { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
    { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
    { id: 'C', text: 'C', kind: 'agent', description: '', global: false },
    { id: 'D', text: 'D', kind: 'agent', description: '', global: false },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
  ],
};

const DISCONNECTED_GRAPH: Graph = {
  startNode: 'A',
  agents: [],
  nodes: [
    { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
    { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
    { id: 'Orphan', text: 'Orphan', kind: 'agent', description: '', global: false },
  ],
  edges: [{ from: 'A', to: 'B' }],
};

const CYCLE_GRAPH: Graph = {
  startNode: 'A',
  agents: [],
  nodes: [
    { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
    { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'A' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEPTH_A = 0;
const DEPTH_B = 1;
const DEPTH_C = 2;
const MAX_DEPTH_ONE = 1;
const PATH_TWO_HOPS = 2;
const PATH_ZERO = 0;
const ONE_EDGE = 1;

/* ------------------------------------------------------------------ */
/*  bfsReachability                                                    */
/* ------------------------------------------------------------------ */

describe('bfsReachability', () => {
  it('marks all nodes reachable in a fully connected linear graph', () => {
    const result = bfsReachability(LINEAR_GRAPH, 'A');

    expect(result.reachable).toContain('A');
    expect(result.reachable).toContain('B');
    expect(result.reachable).toContain('C');
    expect(result.unreachable).toEqual([]);
  });

  it('marks disconnected node as unreachable', () => {
    const result = bfsReachability(DISCONNECTED_GRAPH, 'A');

    expect(result.reachable).toContain('A');
    expect(result.reachable).toContain('B');
    expect(result.unreachable).toContain('Orphan');
  });

  it('records correct depth for each node', () => {
    const result = bfsReachability(LINEAR_GRAPH, 'A');

    expect(result.depthMap.A).toBe(DEPTH_A);
    expect(result.depthMap.B).toBe(DEPTH_B);
    expect(result.depthMap.C).toBe(DEPTH_C);
  });

  it('respects maxDepth and marks deeper nodes as unreachable', () => {
    const result = bfsReachability(LINEAR_GRAPH, 'A', MAX_DEPTH_ONE);

    expect(result.reachable).toContain('A');
    expect(result.reachable).toContain('B');
    expect(result.unreachable).toContain('C');
  });

  it('handles cycles without infinite loops', () => {
    const result = bfsReachability(CYCLE_GRAPH, 'A');

    expect(result.reachable).toContain('A');
    expect(result.reachable).toContain('B');
    expect(result.unreachable).toEqual([]);
  });

  it('finds all branches in a branching graph', () => {
    const result = bfsReachability(BRANCHING_GRAPH, 'A');

    expect(result.reachable).toContain('B');
    expect(result.reachable).toContain('C');
    expect(result.reachable).toContain('D');
  });
});

/* ------------------------------------------------------------------ */
/*  findShortestPath                                                   */
/* ------------------------------------------------------------------ */

describe('findShortestPath', () => {
  it('finds path in a linear graph', () => {
    const result = findShortestPath(LINEAR_GRAPH, 'A', 'C');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['A', 'B', 'C']);
    expect(result.length).toBe(PATH_TWO_HOPS);
  });

  it('returns not found when no path exists', () => {
    const result = findShortestPath(DISCONNECTED_GRAPH, 'A', 'Orphan');

    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.length).toBe(PATH_ZERO);
  });

  it('returns path of length 0 when from and to are the same node', () => {
    const result = findShortestPath(LINEAR_GRAPH, 'A', 'A');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['A']);
    expect(result.length).toBe(PATH_ZERO);
  });

  it('returns the edges traversed along the path', () => {
    const result = findShortestPath(LINEAR_GRAPH, 'A', 'B');
    const { edges } = result;
    const [firstEdge] = edges;

    expect(edges).toHaveLength(ONE_EDGE);
    expect(firstEdge?.from).toBe('A');
    expect(firstEdge?.to).toBe('B');
  });

  it('handles cycles without infinite loops', () => {
    const result = findShortestPath(CYCLE_GRAPH, 'A', 'B');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['A', 'B']);
  });

  it('finds shortest path in a branching graph', () => {
    const result = findShortestPath(BRANCHING_GRAPH, 'A', 'D');

    expect(result.found).toBe(true);
    expect(result.path).toEqual(['A', 'B', 'D']);
  });
});

/* ------------------------------------------------------------------ */
/*  getDeadEndNodes                                                    */
/* ------------------------------------------------------------------ */

describe('getDeadEndNodes', () => {
  it('returns node IDs with no outbound edges and no terminal flags', () => {
    const result = getDeadEndNodes(LINEAR_GRAPH);

    expect(result).toContain('C');
  });

  it('excludes nodes with nextNodeIsUser', () => {
    const graph: Graph = {
      ...LINEAR_GRAPH,
      nodes: [
        { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
        { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
        { id: 'C', text: 'C', kind: 'agent', description: '', global: false, nextNodeIsUser: true },
      ],
    };

    expect(getDeadEndNodes(graph)).not.toContain('C');
  });

  it('excludes global nodes', () => {
    const graph: Graph = {
      ...LINEAR_GRAPH,
      nodes: [
        { id: 'A', text: 'A', kind: 'agent', description: '', global: false },
        { id: 'B', text: 'B', kind: 'agent', description: '', global: false },
        { id: 'C', text: 'C', kind: 'agent', description: '', global: true },
      ],
    };

    expect(getDeadEndNodes(graph)).not.toContain('C');
  });
});

/* ------------------------------------------------------------------ */
/*  getOrphanNodeIds                                                   */
/* ------------------------------------------------------------------ */

describe('getOrphanNodeIds', () => {
  it('returns empty array when all nodes are reachable from startNode', () => {
    expect(getOrphanNodeIds(LINEAR_GRAPH)).toEqual([]);
  });

  it('returns orphan node IDs', () => {
    const result = getOrphanNodeIds(DISCONNECTED_GRAPH);

    expect(result).toContain('Orphan');
    expect(result).not.toContain('A');
    expect(result).not.toContain('B');
  });
});
