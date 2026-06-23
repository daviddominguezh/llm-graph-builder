import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import type { TenantRow } from '../../db/queries/tenantQueries.js';
import type { AuthenticatedResponse } from '../routeHelpers.js';

const HTTP_OK = 200;
const FIRST = 0;
const VERSION = 1;

const AGENT_ID = 'agent-1';
const ORG_ID = 'org-1';
const DEFAULT_TENANT_ID = 'tenant-default';
const OTHER_TENANT_ID = 'tenant-other';
const SERVER_ID = 'srv-1';

const SERVER: McpServerConfig = {
  id: SERVER_ID,
  name: 'srv',
  enabled: true,
  transport: { type: 'http', url: 'https://api.example.com/{{REGION}}/mcp' },
  variableValues: { REGION: { type: 'direct', value: 'agent-wide' } },
};

function makeTenant(id: string, isDefault: boolean): TenantRow {
  return {
    id,
    org_id: ORG_ID,
    slug: id,
    name: id,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    web_channel_enabled: false,
    web_channel_allowed_origins: [],
    is_default: isDefault,
  };
}

const DEFAULT_CONFIG: McpTenantConfigRow = {
  agent_id: AGENT_ID,
  server_id: SERVER_ID,
  tenant_id: DEFAULT_TENANT_ID,
  variable_values: { REGION: { type: 'direct', value: 'eu-default' } },
  updated_at: '2026-01-01T00:00:00Z',
};

const OTHER_CONFIG: McpTenantConfigRow = {
  agent_id: AGENT_ID,
  server_id: SERVER_ID,
  tenant_id: OTHER_TENANT_ID,
  variable_values: { REGION: { type: 'direct', value: 'us-other' } },
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGetAgentById =
  jest.fn<() => Promise<{ result: { org_id: string; current_version: number } | null; error: null }>>();
const mockGetPublishedGraphData = jest.fn<() => Promise<Record<string, unknown> | null>>();
const mockGetDecryptedEnvVariables =
  jest.fn<() => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>>();
const mockGetTenantsByOrg = jest.fn<() => Promise<{ result: TenantRow[]; error: null }>>();
const mockGetTenantConfigs = jest.fn<() => Promise<McpTenantConfigRow[]>>();

let capturedOrgMcpServers: McpServerConfig[] = [];
let capturedCtxTenantId = '';

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  getAgentById: mockGetAgentById,
}));
jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getPublishedGraphData: mockGetPublishedGraphData,
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));
jest.unstable_mockModule('../../db/queries/tenantQueries.js', () => ({
  getTenantsByOrg: mockGetTenantsByOrg,
}));
jest.unstable_mockModule('../../db/queries/mcpTenantConfigQueries.js', () => ({
  getTenantConfigs: mockGetTenantConfigs,
}));
jest.unstable_mockModule('../../lib/guardedCreateTransport.js', () => ({
  makeGuardedCreateTransport: jest.fn(),
}));

interface ComposeArgs {
  orgMcpServers: McpServerConfig[];
}
interface DescribeCtx {
  tenantId: string;
}

const actualRunner = await import('@daviddh/llm-graph-runner');

jest.unstable_mockModule('@daviddh/llm-graph-runner', () => ({
  ...actualRunner,
  builtInProviders: [],
  composeRegistry: (args: ComposeArgs) => {
    ({ orgMcpServers: capturedOrgMcpServers } = args);
    return {
      describeAll: async (ctx: DescribeCtx): Promise<unknown[]> => {
        ({ tenantId: capturedCtxTenantId } = ctx);
        return await Promise.resolve([]);
      },
    };
  },
}));

const { handleGetAgentRegistry } = await import('./getRegistry.js');

function makeApp(): express.Express {
  const app = express();
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase: { from: jest.fn() } });
    next();
  });
  app.get('/agents/:agentId/registry', (req, res: AuthenticatedResponse) => {
    void handleGetAgentRegistry(req, res);
  });
  return app;
}

function resetMocks(): void {
  capturedOrgMcpServers = [];
  capturedCtxTenantId = '';
  mockGetAgentById.mockResolvedValue({
    result: { org_id: ORG_ID, current_version: VERSION },
    error: null,
  });
  mockGetPublishedGraphData.mockResolvedValue({ mcpServers: [SERVER] });
  mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: {} });
  mockGetTenantsByOrg.mockResolvedValue({
    result: [makeTenant(DEFAULT_TENANT_ID, true), makeTenant(OTHER_TENANT_ID, false)],
    error: null,
  });
  mockGetTenantConfigs.mockResolvedValue([DEFAULT_CONFIG, OTHER_CONFIG]);
}

function urlOf(server: McpServerConfig | undefined): string {
  if (server === undefined) return '';
  return server.transport.type === 'stdio' ? '' : server.transport.url;
}

describe('handleGetAgentRegistry — default tenant resolution', () => {
  it('resolves transport against the DEFAULT tenant config (not agent-wide)', async () => {
    resetMocks();
    const res = await request(makeApp()).get(`/agents/${AGENT_ID}/registry`);

    expect(res.status).toBe(HTTP_OK);
    expect(urlOf(capturedOrgMcpServers[FIRST])).toBe('https://api.example.com/eu-default/mcp');
  });

  it('passes the default tenant id on the provider ctx', async () => {
    resetMocks();
    await request(makeApp()).get(`/agents/${AGENT_ID}/registry`);

    expect(capturedCtxTenantId).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to the agent-wide values when no default tenant config row exists', async () => {
    resetMocks();
    mockGetTenantConfigs.mockResolvedValue([OTHER_CONFIG]);
    await request(makeApp()).get(`/agents/${AGENT_ID}/registry`);

    expect(urlOf(capturedOrgMcpServers[FIRST])).toBe('https://api.example.com/agent-wide/mcp');
  });
});
