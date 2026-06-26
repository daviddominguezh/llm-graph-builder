import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Constants (avoid magic-numbers lint)                               */
/* ------------------------------------------------------------------ */

const VERSION = 2;
const FIRST = 0;

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

const mockGetPublishedGraphData = jest.fn<() => Promise<Record<string, unknown>>>();
const mockGetDecryptedApiKeyValue = jest.fn<() => Promise<string>>();
const mockGetDecryptedEnvVariables =
  jest.fn<() => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>>();

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getPublishedGraphData: mockGetPublishedGraphData,
  getDecryptedApiKeyValue: mockGetDecryptedApiKeyValue,
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));

const { fetchGraphAndKeys } = await import('./executeFetcher.js');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MCP = {
  id: 'mcp-1',
  name: 'My MCP',
  transport: { type: 'http', url: 'https://x.com/mcp' },
  enabled: true,
};

const P = { agentId: 'a1', version: VERSION, orgId: 'o1', productionApiKeyId: 'k1' };

interface AppTypeRow {
  data: { app_type: string };
}

function buildStub(appType: string): unknown {
  const single = async (): Promise<AppTypeRow> => await Promise.resolve({ data: { app_type: appType } });
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })) };
}

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value;
}

/**
 * Builds a minimal Supabase stub whose `from('agents').select(...).eq(...).single()`
 * resolves to the given app_type — the only call `fetchGraphAndKeys` makes directly on
 * the client (the executionAuthQueries are module-mocked and ignore their supabase arg).
 *
 * Narrowed via a user-defined type guard (the lint-clean idiom used by middleware/gates.ts)
 * rather than a type assertion, which @typescript-eslint/no-unsafe-type-assertion forbids.
 */
function appTypeSupabase(appType: string): SupabaseClient {
  const stub = buildStub(appType);
  if (!isSupabaseClient(stub)) throw new Error('stub is not a supabase client');
  return stub;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('fetchGraphAndKeys', () => {
  beforeEach(() => {
    mockGetDecryptedApiKeyValue.mockResolvedValue('api-key');
    mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: {} });
  });

  it('agent app-type surfaces mcpServers', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi', mcpServers: [MCP] });
    const r = await fetchGraphAndKeys({ supabase: appTypeSupabase('agent'), ...P });
    expect(r.appType).toBe('agent');
    const servers = r.graph.mcpServers ?? [];
    expect(servers[FIRST]?.id).toBe('mcp-1');
    expect(r.graph.nodes).toEqual([]);
  });

  it('agent without mcpServers → undefined', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi' });
    const r = await fetchGraphAndKeys({ supabase: appTypeSupabase('agent'), ...P });
    expect(r.graph.mcpServers).toBeUndefined();
  });

  it('workflow app-type uses full graph validation (regression)', async () => {
    mockGetPublishedGraphData.mockResolvedValue({
      startNode: 'INITIAL_STEP',
      agents: [],
      nodes: [],
      edges: [],
      initialUserMessage: '',
    });
    const r = await fetchGraphAndKeys({ supabase: appTypeSupabase('workflow'), ...P });
    expect(r.appType).toBe('workflow');
    expect(r.graph.startNode).toBe('INITIAL_STEP');
  });
});

/* ------------------------------------------------------------------ */
/*  fetchAgentConfig skills                                            */
/* ------------------------------------------------------------------ */

function buildVersionStub(graphData: unknown): unknown {
  const single = jest.fn(async () => await Promise.resolve({ data: { graph_data: graphData } }));
  const eqVersion = jest.fn(() => ({ single }));
  const eqAgent = jest.fn(() => ({ eq: eqVersion }));
  const select = jest.fn(() => ({ eq: eqAgent }));
  return { from: jest.fn(() => ({ select })) };
}

function versionSupabase(graphData: unknown): SupabaseClient {
  const stub = buildVersionStub(graphData);
  if (!isSupabaseClient(stub)) throw new Error('stub is not a supabase client');
  return stub;
}

describe('fetchAgentConfig skills', () => {
  it('returns validated skills from graph_data', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    const cfg = await fetchAgentConfig(
      versionSupabase({
        systemPrompt: 'p',
        skills: [{ name: 'refund', description: 'd', content: 'x', repoUrl: null, sortOrder: FIRST }],
      }),
      'a1',
      VERSION
    );
    expect(cfg.skills).toEqual([{ name: 'refund', description: 'd', content: 'x' }]);
  });

  it('absent skills → []', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    expect((await fetchAgentConfig(versionSupabase({ systemPrompt: 'p' }), 'a1', VERSION)).skills).toEqual(
      []
    );
  });
});
