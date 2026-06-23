import type { VariableValue } from '@daviddh/graph-types';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type {
  McpTenantConfigRow,
  UpsertCellArgs,
  UpsertCellResult,
} from '../../db/queries/mcpTenantConfigQueries.js';
import type { McpTenantDiscoveryRow, ResetArgs } from '../../db/queries/mcpTenantDiscoveryQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { AuthenticatedResponse } from '../routeHelpers.js';

/* ------------------------------------------------------------------ */
/*  Seam mocks                                                         */
/* ------------------------------------------------------------------ */

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const NONE = 0;

let configsToReturn: McpTenantConfigRow[] = [];
let discoveryToReturn: McpTenantDiscoveryRow[] = [];
let upsertResult: UpsertCellResult = { kind: 'conflict' };
const upsertCalls: UpsertCellArgs[] = [];
const resetCalls: ResetArgs[] = [];

const mockGetTenantConfigs = jest.fn<(s: SupabaseClient, a: string) => Promise<McpTenantConfigRow[]>>(
  async () => await Promise.resolve(configsToReturn)
);
const mockUpsertTenantConfigCell = jest.fn<
  (s: SupabaseClient, a: UpsertCellArgs) => Promise<UpsertCellResult>
>(async (_s, args) => {
  upsertCalls.push(args);
  return await Promise.resolve(upsertResult);
});
const mockHashVariableValues = jest.fn<(v: Record<string, VariableValue>) => string>(() => 'hash');

jest.unstable_mockModule('../../db/queries/mcpTenantConfigQueries.js', () => ({
  getTenantConfigs: mockGetTenantConfigs,
  upsertTenantConfigCell: mockUpsertTenantConfigCell,
  hashVariableValues: mockHashVariableValues,
}));

const mockGetTenantDiscovery = jest.fn<(s: SupabaseClient, a: string) => Promise<McpTenantDiscoveryRow[]>>(
  async () => await Promise.resolve(discoveryToReturn)
);
const mockResetDiscovery = jest.fn<(s: SupabaseClient, a: ResetArgs) => Promise<void>>(async (_s, args) => {
  resetCalls.push(args);
  await Promise.resolve();
});

jest.unstable_mockModule('../../db/queries/mcpTenantDiscoveryQueries.js', () => ({
  getTenantDiscovery: mockGetTenantDiscovery,
  resetDiscovery: mockResetDiscovery,
}));

const { handleGetTenantConfig, handlePutTenantConfigCell } = await import('./mcpTenantConfigHandlers.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const AGENT_ID = 'a1';
const SERVER_ID = 's1';
const TENANT_ID = 't1';

const FIRST = 0;

function configRow(overrides: Partial<McpTenantConfigRow> = {}): McpTenantConfigRow {
  return {
    agent_id: AGENT_ID,
    server_id: SERVER_ID,
    tenant_id: TENANT_ID,
    variable_values: {},
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function discoveryRow(overrides: Partial<McpTenantDiscoveryRow> = {}): McpTenantDiscoveryRow {
  return {
    agent_id: AGENT_ID,
    server_id: SERVER_ID,
    tenant_id: TENANT_ID,
    status: 'ok',
    error: null,
    values_hash: 'hash',
    discovered_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function appWith(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase: { from: jest.fn() }, userId: 'u1' });
    next();
  });
  app.get('/agents/:agentId/mcp-tenant-config', (req, res: AuthenticatedResponse) => {
    void handleGetTenantConfig(req, res);
  });
  app.put('/agents/:agentId/mcp-tenant-config/:serverId/:tenantId', (req, res: AuthenticatedResponse) => {
    void handlePutTenantConfigCell(req, res);
  });
  return app;
}

afterEach(() => {
  jest.clearAllMocks();
  upsertCalls.length = NONE;
  resetCalls.length = NONE;
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('handleGetTenantConfig', () => {
  it('returns configs and discovery for the agent', async () => {
    configsToReturn = [configRow()];
    discoveryToReturn = [discoveryRow()];
    const res = await request(appWith()).get(`/agents/${AGENT_ID}/mcp-tenant-config`);
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toMatchObject({ configs: [configRow()], discovery: [discoveryRow()] });
    expect(mockGetTenantConfigs).toHaveBeenCalledWith(expect.anything(), AGENT_ID);
  });
});

describe('handlePutTenantConfigCell', () => {
  it('returns 409 on a conflict result', async () => {
    upsertResult = { kind: 'conflict' };
    const res = await request(appWith())
      .put(`/agents/${AGENT_ID}/mcp-tenant-config/${SERVER_ID}/${TENANT_ID}`)
      .send({ variableValues: {}, expectedUpdatedAt: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(HTTP_CONFLICT);
    expect(res.body).toEqual({ error: 'conflict' });
    expect(resetCalls).toHaveLength(NONE);
  });

  it('returns 200 and resets discovery for the cell on a successful save', async () => {
    upsertResult = { kind: 'ok', row: configRow() };
    const res = await request(appWith())
      .put(`/agents/${AGENT_ID}/mcp-tenant-config/${SERVER_ID}/${TENANT_ID}`)
      .send({ variableValues: {}, expectedUpdatedAt: null });
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toMatchObject({ row: { server_id: SERVER_ID } });
    expect(upsertCalls[FIRST]).toMatchObject({
      agentId: AGENT_ID,
      serverId: SERVER_ID,
      tenantId: TENANT_ID,
      expectedUpdatedAt: null,
    });
    expect(resetCalls).toEqual([{ agentId: AGENT_ID, serverId: SERVER_ID, tenantId: TENANT_ID }]);
  });
});
