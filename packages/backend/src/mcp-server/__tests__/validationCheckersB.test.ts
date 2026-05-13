import type { Graph, Node } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import {
  checkBrokenJumps,
  checkDanglingFallbacks,
  checkDanglingSchemas,
  checkGlobalNodeTools,
} from '../services/validationCheckers.js';

/* ------------------------------------------------------------------ */
/*  Shared node factory                                                */
/* ------------------------------------------------------------------ */

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return { id, text: id, kind: 'agent', description: '', global: false, ...overrides };
}

const ONE_VIOLATION = 1;

const GLOBAL_TOOL_CALL_PRECONDITION = {
  type: 'tool_call',
  tool: { providerType: 'builtin', providerId: 'calendar', toolName: 'myTool' },
} as const;

/* ------------------------------------------------------------------ */
/*  checkBrokenJumps                                                   */
/* ------------------------------------------------------------------ */

describe('checkBrokenJumps', () => {
  it('reports no violations when jumpTo references an existing node', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [{ from: 'A', to: 'B', contextPreconditions: { preconditions: [], jumpTo: 'C' } }],
    };

    expect(checkBrokenJumps(graph)).toEqual([]);
  });

  it('flags jumpTo pointing to non-existent node as BROKEN_JUMP error', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [{ from: 'A', to: 'B', contextPreconditions: { preconditions: [], jumpTo: 'Ghost' } }],
    };

    const violations = checkBrokenJumps(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('BROKEN_JUMP');
    expect(firstViolation?.severity).toBe('error');
    expect(firstViolation?.edgeRef).toEqual({ from: 'A', to: 'B' });
  });

  it('skips edges without contextPreconditions jumpTo', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('B')],
      edges: [{ from: 'A', to: 'B' }],
    };

    expect(checkBrokenJumps(graph)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkDanglingSchemas                                               */
/* ------------------------------------------------------------------ */

describe('checkDanglingSchemas', () => {
  it('reports no violations when outputSchemaId references existing schema', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { outputSchemaId: 'schema-1' })],
      edges: [],
      outputSchemas: [{ id: 'schema-1', name: 'MySchema', fields: [] }],
    };

    expect(checkDanglingSchemas(graph)).toEqual([]);
  });

  it('flags outputSchemaId referencing missing schema as DANGLING_SCHEMA error', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { outputSchemaId: 'schema-999' })],
      edges: [],
      outputSchemas: [{ id: 'schema-1', name: 'MySchema', fields: [] }],
    };

    const violations = checkDanglingSchemas(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('DANGLING_SCHEMA');
    expect(firstViolation?.severity).toBe('error');
    expect(firstViolation?.nodeIds).toContain('A');
  });

  it('skips nodes without outputSchemaId', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A')],
      edges: [],
    };

    expect(checkDanglingSchemas(graph)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkDanglingFallbacks                                             */
/* ------------------------------------------------------------------ */

describe('checkDanglingFallbacks', () => {
  it('reports no violations when fallbackNodeId references existing node', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { fallbackNodeId: 'B' }), makeNode('B')],
      edges: [],
    };

    expect(checkDanglingFallbacks(graph)).toEqual([]);
  });

  it('flags fallbackNodeId referencing missing node as DANGLING_FALLBACK error', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A', { fallbackNodeId: 'Ghost' })],
      edges: [],
    };

    const violations = checkDanglingFallbacks(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('DANGLING_FALLBACK');
    expect(firstViolation?.severity).toBe('error');
    expect(firstViolation?.nodeIds).toContain('A');
  });

  it('skips nodes without fallbackNodeId', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A')],
      edges: [],
    };

    expect(checkDanglingFallbacks(graph)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkGlobalNodeTools                                               */
/* ------------------------------------------------------------------ */

describe('checkGlobalNodeTools', () => {
  it('reports no violations when global node has exactly one tool_call edge', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('Global', { global: true })],
      edges: [
        { from: 'A', to: 'Global' },
        { from: 'Global', to: 'A', preconditions: [GLOBAL_TOOL_CALL_PRECONDITION] },
      ],
    };

    expect(checkGlobalNodeTools(graph)).toEqual([]);
  });

  it('flags global node with no tool_call outbound edge as GLOBAL_NODE_MISSING_TOOL warning', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A'), makeNode('Global', { global: true })],
      edges: [
        { from: 'A', to: 'Global' },
        { from: 'Global', to: 'A', preconditions: [{ type: 'agent_decision', value: 'done' }] },
      ],
    };

    const violations = checkGlobalNodeTools(graph);
    const [firstViolation] = violations;

    expect(violations).toHaveLength(ONE_VIOLATION);
    expect(firstViolation?.code).toBe('GLOBAL_NODE_MISSING_TOOL');
    expect(firstViolation?.severity).toBe('warning');
    expect(firstViolation?.nodeIds).toContain('Global');
  });

  it('skips non-global nodes', () => {
    const graph: Graph = {
      startNode: 'A',
      agents: [],
      nodes: [makeNode('A')],
      edges: [],
    };

    expect(checkGlobalNodeTools(graph)).toEqual([]);
  });
});
