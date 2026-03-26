import type { Graph } from '@daviddh/graph-types';
import type { CallAgentOutput } from '@daviddh/llm-graph-runner';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AgentRow } from '../../db/queries/agentQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { McpSession } from '../../mcp/lifecycle.js';
import type { SimulateAgentParams } from '../services/simulateService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (s: SupabaseClient, id: string) => Promise<Graph | null>;
type GetAgentBySlugFn = (
  s: SupabaseClient,
  slug: string
) => Promise<{ result: AgentRow | null; error: string | null }>;
type GetDecryptedApiKeyValueFn = (s: SupabaseClient, keyId: string) => Promise<string | null>;
type GetDecryptedEnvVariablesFn = (s: SupabaseClient, orgId: string) => Promise<Record<string, string>>;
type CreateMcpSessionFn = (servers: unknown[]) => Promise<McpSession>;
type CloseMcpSessionFn = (session: McpSession) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  Mock setup                                                         */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockGetAgentBySlug = jest.fn<GetAgentBySlugFn>();
const mockGetDecryptedApiKeyValue = jest.fn<GetDecryptedApiKeyValueFn>();
const mockGetDecryptedEnvVariables = jest.fn<GetDecryptedEnvVariablesFn>();
const mockCreateMcpSession = jest.fn<CreateMcpSessionFn>();
const mockCloseMcpSession = jest.fn<CloseMcpSessionFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  getAgentBySlug: mockGetAgentBySlug,
}));

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getDecryptedApiKeyValue: mockGetDecryptedApiKeyValue,
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));

jest.unstable_mockModule('../../mcp/lifecycle.js', () => ({
  createMcpSession: mockCreateMcpSession,
  closeMcpSession: mockCloseMcpSession,
}));

const { simulateAgent } = await import('../services/simulateService.js');

/* ------------------------------------------------------------------ */
/*  Constants and fixtures                                             */
/* ------------------------------------------------------------------ */

const AGENT_VERSION = 1;
const INPUT_TOKENS = 10;
const OUTPUT_TOKENS = 5;
const CACHED_TOKENS = 2;
const CALLED_ONCE = 1;
const mockSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const agentRow: AgentRow = {
  id: 'agent-1',
  org_id: 'org-1',
  name: 'Test Agent',
  slug: 'test-agent',
  description: 'A test agent',
  start_node: 'node-1',
  current_version: AGENT_VERSION,
  version: AGENT_VERSION,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  staging_api_key_id: 'key-abc',
  production_api_key_id: null,
  is_public: false,
  category: 'engineering',
  created_from_template_id: null,
};

const graph: Graph = {
  startNode: 'node-1',
  agents: [{ id: 'default', description: '' }],
  nodes: [{ id: 'node-1', text: 'Hello', kind: 'agent', description: '', global: false }],
  edges: [],
};

const emptySession: McpSession = { clients: [], tools: {} };
const defaultMessages = [{ role: 'user' as const, content: 'Hi' }];

function buildParams(ctx: ServiceContext): SimulateAgentParams {
  return { ctx, agentId: 'agent-1', agentSlug: 'test-agent', input: { messages: defaultMessages } };
}

function setupSuccessMocks(): void {
  mockAssembleGraph.mockResolvedValue(graph);
  mockGetAgentBySlug.mockResolvedValue({ result: agentRow, error: null });
  mockGetDecryptedApiKeyValue.mockResolvedValue('sk-test-key');
  mockGetDecryptedEnvVariables.mockResolvedValue({});
  mockCreateMcpSession.mockResolvedValue(emptySession);
  mockCloseMcpSession.mockResolvedValue(undefined);
}

const mockOutput: CallAgentOutput = {
  message: null,
  tokensLogs: [
    { action: 'node-1', tokens: { input: INPUT_TOKENS, output: OUTPUT_TOKENS, cached: CACHED_TOKENS } },
  ],
  toolCalls: [],
  visitedNodes: ['node-1'],
  text: 'Hello there!',
  debugMessages: {},
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests - success paths                                              */
/* ------------------------------------------------------------------ */

describe('simulateAgent success', () => {
  it('runs simulation and returns result', async () => {
    setupSuccessMocks();
    const runSim = jest.fn<() => Promise<CallAgentOutput | null>>().mockResolvedValue(mockOutput);
    const result = await simulateAgent(buildParams(buildCtx()), runSim);

    expect(result.response).toBe('Hello there!');
    expect(result.visitedNodes).toEqual(['node-1']);
    expect(result.tokenUsage).toEqual({ input: INPUT_TOKENS, output: OUTPUT_TOKENS, cached: CACHED_TOKENS });
    expect(mockCloseMcpSession).toHaveBeenCalledTimes(CALLED_ONCE);
  });

  it('returns null response when runner returns null', async () => {
    setupSuccessMocks();
    const runSim = jest.fn<() => Promise<CallAgentOutput | null>>().mockResolvedValue(null);
    const result = await simulateAgent(buildParams(buildCtx()), runSim);

    expect(result.response).toBeNull();
    expect(result.visitedNodes).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests - error paths                                                */
/* ------------------------------------------------------------------ */

describe('simulateAgent errors', () => {
  it('throws when agent has no staging API key', async () => {
    const agentWithoutKey = { ...agentRow, staging_api_key_id: null };
    mockAssembleGraph.mockResolvedValue(graph);
    mockGetAgentBySlug.mockResolvedValue({ result: agentWithoutKey, error: null });
    mockGetDecryptedEnvVariables.mockResolvedValue({});
    mockCreateMcpSession.mockResolvedValue(emptySession);
    mockCloseMcpSession.mockResolvedValue(undefined);
    const runSim = jest.fn<() => Promise<CallAgentOutput | null>>();

    await expect(simulateAgent(buildParams(buildCtx()), runSim)).rejects.toThrow('No staging API key');
  });

  it('closes MCP session even when simulation throws', async () => {
    setupSuccessMocks();
    const runSim = jest.fn<() => Promise<CallAgentOutput | null>>().mockRejectedValue(new Error('boom'));

    await expect(simulateAgent(buildParams(buildCtx()), runSim)).rejects.toThrow('boom');
    expect(mockCloseMcpSession).toHaveBeenCalledTimes(CALLED_ONCE);
  });

  it('throws when graph is not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);
    mockGetAgentBySlug.mockResolvedValue({ result: agentRow, error: null });
    mockGetDecryptedApiKeyValue.mockResolvedValue('sk-test-key');
    mockGetDecryptedEnvVariables.mockResolvedValue({});
    const runSim = jest.fn<() => Promise<CallAgentOutput | null>>();

    await expect(simulateAgent(buildParams(buildCtx()), runSim)).rejects.toThrow();
  });
});
