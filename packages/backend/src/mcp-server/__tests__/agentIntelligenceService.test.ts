import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AgentRow } from '../../db/queries/agentQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { VersionSummary } from '../../db/queries/versionQueries.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                 */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;
type GetAgentBySlugFn = (
  supabase: SupabaseClient,
  slug: string
) => Promise<{ result: AgentRow | null; error: string | null }>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                  */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockGetAgentBySlug = jest.fn<GetAgentBySlugFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  getAgentBySlug: mockGetAgentBySlug,
}));

jest.unstable_mockModule('../services/mcpManagementService.js', () => ({
  listMcpServers: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../services/outputSchemaService.js', () => ({
  listOutputSchemas: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../services/publishService.js', () => ({
  listVersions: jest.fn<() => Promise<VersionSummary[]>>().mockResolvedValue([]),
}));

const { getAgentHealth, getAgentOverview, explainAgentFlow } =
  await import('../services/agentIntelligenceService.js');

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const VERSION_ONE = 1;
const DOMAIN_COUNT_MULTI = 2;
const SALES_NODE_COUNT = 2;
const MIN_SUMMARY_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const AGENT_ROW: AgentRow = {
  id: 'agent-1',
  org_id: 'org-1',
  name: 'Test Agent',
  slug: 'test-agent',
  description: 'Test',
  start_node: 'A',
  current_version: VERSION_ONE,
  version: VERSION_ONE,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  staging_api_key_id: null,
  production_api_key_id: 'key-prod',
};

const CLEAN_GRAPH: Graph = {
  startNode: 'A',
  agents: [{ id: 'bot', description: 'Bot domain' }],
  nodes: [
    { id: 'A', text: 'Start', kind: 'agent', description: '', global: false, agent: 'bot' },
    {
      id: 'B',
      text: 'End',
      kind: 'agent',
      description: '',
      global: false,
      agent: 'bot',
      nextNodeIsUser: true,
    },
  ],
  edges: [{ from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'hi' }] }],
};

const MULTI_DOMAIN_GRAPH: Graph = {
  startNode: 'A',
  agents: [
    { id: 'sales', description: 'Sales domain' },
    { id: 'support', description: 'Support domain' },
  ],
  nodes: [
    { id: 'A', text: 'Entry', kind: 'agent', description: '', global: false, agent: 'sales' },
    { id: 'B', text: 'Sales', kind: 'agent', description: '', global: false, agent: 'sales' },
    {
      id: 'C',
      text: 'Support',
      kind: 'agent',
      description: '',
      global: false,
      agent: 'support',
      nextNodeIsUser: true,
    },
    { id: 'G', text: 'Global', kind: 'agent', description: '', global: true },
  ],
  edges: [
    { from: 'A', to: 'B', preconditions: [{ type: 'user_said', value: 'buy' }] },
    { from: 'B', to: 'C', preconditions: [{ type: 'agent_decision', value: 'escalate' }] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  getAgentHealth                                                      */
/* ------------------------------------------------------------------ */

describe('getAgentHealth', () => {
  it('returns healthy status for a clean graph', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    mockGetAgentBySlug.mockResolvedValue({ result: AGENT_ROW, error: null });

    const result = await getAgentHealth(buildCtx(), 'agent-1');

    expect(result.status).toBe('healthy');
    expect(result.violations).toEqual([]);
    expect(result.orphanNodes).toEqual([]);
    expect(result.deadEndNodes).toEqual([]);
  });

  it('reports staging key config issue when staging key is null', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    mockGetAgentBySlug.mockResolvedValue({ result: AGENT_ROW, error: null });

    const result = await getAgentHealth(buildCtx(), 'agent-1');

    const stagingIssue = result.configIssues.find((i) => i.field === 'staging_api_key_id');
    expect(stagingIssue).toBeDefined();
  });

  it('returns warnings when graph has violations', async () => {
    const orphanGraph: Graph = {
      ...CLEAN_GRAPH,
      nodes: [
        ...CLEAN_GRAPH.nodes,
        { id: 'orphan', text: 'orphan', kind: 'agent', description: '', global: false },
      ],
    };
    mockAssembleGraph.mockResolvedValue(orphanGraph);
    mockGetAgentBySlug.mockResolvedValue({ result: AGENT_ROW, error: null });

    const result = await getAgentHealth(buildCtx(), 'agent-1');

    expect(result.status).not.toBe('healthy');
  });
});

/* ------------------------------------------------------------------ */
/*  getAgentOverview                                                    */
/* ------------------------------------------------------------------ */

describe('getAgentOverview', () => {
  it('returns overview combining all service data', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);
    mockGetAgentBySlug.mockResolvedValue({ result: AGENT_ROW, error: null });

    const result = await getAgentOverview(buildCtx(), 'agent-1', 'test-agent');

    expect(result.agent).toEqual(AGENT_ROW);
    expect(result.graphSummary).toBeDefined();
    expect(result.health).toBeDefined();
    expect(result.mcpServers).toEqual([]);
    expect(result.outputSchemas).toEqual([]);
    expect(result.versions).toEqual([]);
  });

  it('throws when agent not found', async () => {
    mockGetAgentBySlug.mockResolvedValue({ result: null, error: 'Not found' });

    await expect(getAgentOverview(buildCtx(), 'agent-1', 'missing')).rejects.toThrow('Not found');
  });
});

/* ------------------------------------------------------------------ */
/*  explainAgentFlow                                                    */
/* ------------------------------------------------------------------ */

describe('explainAgentFlow', () => {
  it('returns domain breakdown for multi-domain graph', async () => {
    mockAssembleGraph.mockResolvedValue(MULTI_DOMAIN_GRAPH);

    const result = await explainAgentFlow(buildCtx(), 'agent-1');

    expect(result.domains).toHaveLength(DOMAIN_COUNT_MULTI);
    const salesDomain = result.domains.find((d) => d.domainKey === 'sales');
    expect(salesDomain).toBeDefined();
    expect(salesDomain?.nodeCount).toBe(SALES_NODE_COUNT);
  });

  it('identifies global behaviors', async () => {
    mockAssembleGraph.mockResolvedValue(MULTI_DOMAIN_GRAPH);

    const result = await explainAgentFlow(buildCtx(), 'agent-1');

    expect(result.globalBehaviors).toContain('G');
  });

  it('includes a summary string', async () => {
    mockAssembleGraph.mockResolvedValue(CLEAN_GRAPH);

    const result = await explainAgentFlow(buildCtx(), 'agent-1');

    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(MIN_SUMMARY_LENGTH);
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(explainAgentFlow(buildCtx(), 'missing')).rejects.toThrow('Graph not found');
  });

  it('identifies cross-domain entry and exit points', async () => {
    mockAssembleGraph.mockResolvedValue(MULTI_DOMAIN_GRAPH);

    const result = await explainAgentFlow(buildCtx(), 'agent-1');

    const supportDomain = result.domains.find((d) => d.domainKey === 'support');
    expect(supportDomain?.entryPoints).toContain('C');
  });
});
