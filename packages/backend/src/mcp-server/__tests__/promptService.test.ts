import type { Edge, Graph, Node } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (s: SupabaseClient, id: string) => Promise<Graph | null>;

/* ------------------------------------------------------------------ */
/*  Mock setup                                                         */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

const { getNodePrompt, extractTemplateVariables } = await import('../services/promptService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SINGLE_ITEM = 1;
const FIRST_INDEX = 0;
const mockSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

function buildNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    text: 'Hello {BOT_NAME}, welcome to {BUSINESS_NAME}',
    kind: 'agent',
    description: '',
    global: false,
    ...overrides,
  };
}

function buildEdge(overrides: Partial<Edge> = {}): Edge {
  return { from: 'node-1', to: 'node-2', ...overrides };
}

function buildGraph(nodes: Node[], edges: Edge[]): Graph {
  return {
    startNode: 'node-1',
    agents: [{ id: 'default', description: '' }],
    nodes,
    edges,
    outputSchemas: [
      { id: 'schema-1', name: 'OrderSchema', fields: [{ name: 'orderId', type: 'string', required: true }] },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  extractTemplateVariables                                           */
/* ------------------------------------------------------------------ */

describe('extractTemplateVariables', () => {
  it('extracts uppercase template variables', () => {
    const result = extractTemplateVariables('Hello {BOT_NAME}, welcome to {BUSINESS_NAME}');
    expect(result).toContain('{BOT_NAME}');
    expect(result).toContain('{BUSINESS_NAME}');
  });

  it('returns empty array for text without variables', () => {
    expect(extractTemplateVariables('Hello world')).toEqual([]);
  });

  it('ignores lowercase variables', () => {
    expect(extractTemplateVariables('Hello {lowercase}')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  getNodePrompt - routing kinds                                      */
/* ------------------------------------------------------------------ */

describe('getNodePrompt routing kinds', () => {
  it('returns tool_call kind with correct options', async () => {
    const edge = buildEdge({
      preconditions: [
        {
          type: 'tool_call',
          tool: { providerType: 'builtin', providerId: 'calendar', toolName: 'search_orders' },
          description: 'Search orders',
        },
      ],
    });
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode()], [edge]));

    const result = await getNodePrompt(buildCtx(), 'agent-1', 'node-1');

    expect(result.kind).toBe('tool_call');
    expect(result.options).toHaveLength(SINGLE_ITEM);
    expect(result.options[FIRST_INDEX]?.preconditionType).toBe('tool_call');
    expect(result.options[FIRST_INDEX]?.value).toBe('search_orders');
    expect(result.templateVariables).toContain('{BOT_NAME}');
  });

  it('returns agent_decision kind', async () => {
    const edge = buildEdge({ preconditions: [{ type: 'agent_decision', value: 'greet' }] });
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode({ text: 'Decide' })], [edge]));

    expect((await getNodePrompt(buildCtx(), 'agent-1', 'node-1')).kind).toBe('agent_decision');
  });

  it('returns user_reply kind', async () => {
    const edge = buildEdge({ preconditions: [{ type: 'user_said', value: 'yes' }] });
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode({ text: 'Ask' })], [edge]));

    expect((await getNodePrompt(buildCtx(), 'agent-1', 'node-1')).kind).toBe('user_reply');
  });

  it('returns terminal kind when no outbound edges', async () => {
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode({ nextNodeIsUser: true })], []));

    expect((await getNodePrompt(buildCtx(), 'agent-1', 'node-1')).kind).toBe('terminal');
  });
});

/* ------------------------------------------------------------------ */
/*  getNodePrompt - supplementary data                                 */
/* ------------------------------------------------------------------ */

describe('getNodePrompt supplementary data', () => {
  it('includes fallback when present', async () => {
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode({ fallbackNodeId: 'fallback-node' })], []));

    const result = await getNodePrompt(buildCtx(), 'agent-1', 'node-1');

    expect(result.fallback).toEqual({ nodeId: 'fallback-node' });
  });

  it('includes output schema when node has outputSchemaId', async () => {
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode({ outputSchemaId: 'schema-1' })], []));

    const result = await getNodePrompt(buildCtx(), 'agent-1', 'node-1');

    expect(result.outputSchema?.name).toBe('OrderSchema');
  });

  it('lists global tool node IDs', async () => {
    const globalNode = buildNode({ id: 'global-1', global: true, kind: 'agent' });
    mockAssembleGraph.mockResolvedValue(buildGraph([buildNode(), globalNode], []));

    expect((await getNodePrompt(buildCtx(), 'agent-1', 'node-1')).globalTools).toContain('global-1');
  });

  it('throws when node is not found', async () => {
    mockAssembleGraph.mockResolvedValue(buildGraph([], []));

    await expect(getNodePrompt(buildCtx(), 'agent-1', 'missing-node')).rejects.toThrow('Node not found');
  });

  it('throws when graph is not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(getNodePrompt(buildCtx(), 'agent-1', 'node-1')).rejects.toThrow();
  });
});
