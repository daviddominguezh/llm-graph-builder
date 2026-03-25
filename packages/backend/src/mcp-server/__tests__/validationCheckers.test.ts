import type { Edge, Graph, Node } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import {
  checkDeadEnds,
  checkDuplicateEdges,
  checkMissingPreconditions,
  checkOrphanNodes,
  checkUnknownAgents,
} from '../services/validationCheckers.js';

/* ------------------------------------------------------------------ */
/*  Shared node factory                                                */
/* ------------------------------------------------------------------ */

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return { id, text: id, kind: 'agent', description: '', global: false, ...overrides };
}

const ONE_VIOLATION = 1;

/* ------------------------------------------------------------------ */
/*  checkOrphanNodes                                                   */
/* ------------------------------------------------------------------ */

describe('checkOrphanNodes', () => {
  it('reports no violations when all nodes are reachable', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [{ from: 'A', to: 'B' }],
    };

    expect(checkOrphanNodes(graph)).toEqual([]);
  });

  it('flags disconnected node as ORPHAN_NODE warning', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [{ from: 'A', to: 'B' }],
    };

    const violations = checkOrphanNodes(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('ORPHAN_NODE');
    expect(firstViolation?.severity).toBe('warning');
    expect(firstViolation?.nodeIds).toContain('C');
  });

  it('reports multiple orphan nodes', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [],
    };

    const violations = checkOrphanNodes(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.nodeIds).toContain('B');
    expect(firstViolation?.nodeIds).toContain('C');
  });
});

/* ------------------------------------------------------------------ */
/*  checkDeadEnds                                                      */
/* ------------------------------------------------------------------ */

describe('checkDeadEnds', () => {
  it('reports no violations when all non-terminal nodes have outbound edges', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B', { nextNodeIsUser: true })],
      edges: [{ from: 'A', to: 'B' }],
    };

    expect(checkDeadEnds(graph)).toEqual([]);
  });

  it('flags node with no outbound edges as DEAD_END warning', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [{ from: 'A', to: 'B' }],
    };

    const violations = checkDeadEnds(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('DEAD_END');
    expect(firstViolation?.severity).toBe('warning');
    expect(firstViolation?.nodeIds).toContain('B');
  });

  it('does not flag global nodes as dead ends', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B', { global: true })],
      edges: [{ from: 'A', to: 'B' }],
    };

    expect(checkDeadEnds(graph)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkMissingPreconditions                                          */
/* ------------------------------------------------------------------ */

describe('checkMissingPreconditions', () => {
  it('reports no violations when agent_decision edges have proper preconditions', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { kind: 'agent_decision' }), makeNode('B')],
      edges: [
        {
          from: 'A',
          to: 'B',
          preconditions: [{ type: 'agent_decision', value: 'yes' }],
        },
      ],
    };

    expect(checkMissingPreconditions(graph)).toEqual([]);
  });

  it('flags edge from agent_decision without agent_decision precondition', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { kind: 'agent_decision' }), makeNode('B')],
      edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
    };

    const violations = checkMissingPreconditions(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('MISSING_PRECONDITION');
    expect(firstViolation?.severity).toBe('error');
    expect(firstViolation?.edgeRef).toEqual({ from: 'A', to: 'B' });
  });

  it('flags edge from agent_decision with no preconditions at all', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { kind: 'agent_decision' }), makeNode('B')],
      edges: [{ from: 'A', to: 'B' }],
    };

    expect(checkMissingPreconditions(graph)).toHaveLength(ONE_VIOLATION);
  });
});

/* ------------------------------------------------------------------ */
/*  checkUnknownAgents                                                 */
/* ------------------------------------------------------------------ */

describe('checkUnknownAgents', () => {
  it('reports no violations when all agents are known', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [{ id: 'bot', description: '' }],
      nodes: [makeNode('A', { agent: 'bot' })],
      edges: [],
    };

    expect(checkUnknownAgents(graph)).toEqual([]);
  });

  it('flags node with unknown agent as UNKNOWN_AGENT error', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [{ id: 'bot', description: '' }],
      nodes: [makeNode('A', { agent: 'ghost' })],
      edges: [],
    };

    const violations = checkUnknownAgents(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('UNKNOWN_AGENT');
    expect(firstViolation?.severity).toBe('error');
    expect(firstViolation?.nodeIds).toContain('A');
  });

  it('skips nodes without an agent field', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A')],
      edges: [],
    };

    expect(checkUnknownAgents(graph)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkDuplicateEdges                                                */
/* ------------------------------------------------------------------ */

describe('checkDuplicateEdges', () => {
  it('reports no violations when all edges are unique', () => {
    const edge1: Edge = { from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] };
    const edge2: Edge = { from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hello' }] };
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [edge1, edge2],
    };

    expect(checkDuplicateEdges(graph)).toEqual([]);
  });

  it('flags identical from+to+preconditions as DUPLICATE_EDGE warning', () => {
    const preconditions = [{ type: 'user_said' as const, value: 'hi' }];
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [
        { from: 'A', to: 'B', preconditions },
        { from: 'A', to: 'B', preconditions },
      ],
    };

    const violations = checkDuplicateEdges(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('DUPLICATE_EDGE');
    expect(firstViolation?.severity).toBe('warning');
    expect(firstViolation?.edgeRef).toEqual({ from: 'A', to: 'B' });
  });
});
