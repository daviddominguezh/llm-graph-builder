import { McpTransportSchema, type VariableValue } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { DecryptedEnvVars } from '../../db/queries/executionAuthQueries.js';
import type { McpLibraryRow } from '../../db/queries/mcpLibraryQueries.js';
import type { McpServerBinding } from '../../db/queries/mcpServerOperations.js';
import type { McpTenantConfigRow } from '../../db/queries/mcpTenantConfigQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetLibraryItemByIdFn = (
  supabase: SupabaseClient,
  id: string
) => Promise<{ result: McpLibraryRow | null; error: string | null }>;

type GetDecryptedEnvVariablesFn = (supabase: SupabaseClient, orgId: string) => Promise<DecryptedEnvVars>;

type GetMcpServerBindingFn = (
  supabase: SupabaseClient,
  agentId: string,
  libraryItemId: string
) => Promise<McpServerBinding | undefined>;

type GetDefaultTenantIdFn = (supabase: SupabaseClient, orgId: string) => Promise<string | undefined>;

type GetTenantConfigsFn = (supabase: SupabaseClient, agentId: string) => Promise<McpTenantConfigRow[]>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockGetLibraryItemById = jest.fn<GetLibraryItemByIdFn>();
const mockGetDecryptedEnvVariables = jest.fn<GetDecryptedEnvVariablesFn>();
const mockGetMcpServerBinding = jest.fn<GetMcpServerBindingFn>();
const mockGetDefaultTenantId = jest.fn<GetDefaultTenantIdFn>();
const mockGetTenantConfigs = jest.fn<GetTenantConfigsFn>();

// `parseLibraryTransport` is pure (no DB); reimplement it in the mock rather than
// `requireActual`-ing the module we're mocking (that self-import path OOMs under ESM).
jest.unstable_mockModule('../../db/queries/mcpLibraryQueries.js', () => ({
  getLibraryItemById: mockGetLibraryItemById,
  parseLibraryTransport: (row: McpLibraryRow) => {
    const parsed = McpTransportSchema.safeParse({ type: row.transport_type, ...row.transport_config });
    return parsed.success ? parsed.data : null;
  },
}));

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));

jest.unstable_mockModule('../../db/queries/mcpServerOperations.js', () => ({
  getMcpServerBinding: mockGetMcpServerBinding,
}));

jest.unstable_mockModule('../../db/queries/tenantQueries.js', () => ({
  getDefaultTenantId: mockGetDefaultTenantId,
}));

jest.unstable_mockModule('../../db/queries/mcpTenantConfigQueries.js', () => ({
  getTenantConfigs: mockGetTenantConfigs,
}));

const { resolveStaticToken } = await import('./oauthResolveToken.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const makeFakeSupabase = jest.fn<() => SupabaseClient>();
const fakeSupabase = makeFakeSupabase();

const NO_INSTALLATIONS = 0;

function buildTokenRow(headers: Record<string, string>): McpLibraryRow {
  return {
    id: 'lib-1',
    org_id: 'org-1',
    name: 'Linear',
    description: '',
    category: 'productivity',
    image_url: null,
    transport_type: 'http',
    transport_config: { url: 'https://mcp.linear.app/mcp', headers },
    variables: [{ name: 'LINEAR_API_KEY' }],
    installations_count: NO_INSTALLATIONS,
    published_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    auth_type: 'token',
  };
}

function buildEnv(byName: Record<string, string>, byId: Record<string, string> = {}): DecryptedEnvVars {
  return { byName, byId };
}

interface ResolveOverrides {
  variableValues?: Record<string, VariableValue>;
  agentId?: string;
}

async function callResolve(overrides: ResolveOverrides = {}): Promise<string | null> {
  return await resolveStaticToken({
    supabase: fakeSupabase,
    orgId: 'org-1',
    libraryItemId: 'lib-1',
    agentId: overrides.agentId,
    variableValues: overrides.variableValues,
  });
}

function arrangeLibraryItem(headers: Record<string, string>): void {
  mockGetLibraryItemById.mockResolvedValue({ result: buildTokenRow(headers), error: null });
}

const LINEAR_AUTH_HEADER = { Authorization: 'Bearer {{LINEAR_API_KEY}}' };
const REF_ENV_1: Record<string, VariableValue> = { LINEAR_API_KEY: { type: 'env_ref', envVariableId: 'env-1' } };
const EMPTY_DIRECT: Record<string, VariableValue> = { LINEAR_API_KEY: { type: 'direct', value: '' } };

function arrangeSecretEnv(): void {
  mockGetDecryptedEnvVariables.mockResolvedValue(
    buildEnv({ LINEAR_KEY: 'lin_secret_123' }, { 'env-1': 'lin_secret_123' })
  );
}

function buildTenantConfigRow(vars: Record<string, VariableValue>): McpTenantConfigRow {
  return {
    agent_id: 'agent-1',
    server_id: 'srv-1',
    tenant_id: 'tenant-default',
    variable_values: vars,
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/* ------------------------------------------------------------------ */
/*  Test bodies (named to keep the describe callback small)            */
/* ------------------------------------------------------------------ */

async function testHeaderResolvesToSecret(): Promise<void> {
  arrangeLibraryItem(LINEAR_AUTH_HEADER);
  mockGetDecryptedEnvVariables.mockResolvedValue(buildEnv({ LINEAR_API_KEY: 'lin_secret_123' }));
  expect(await callResolve()).toBe('lin_secret_123');
}

async function testMissingVarReturnsNull(): Promise<void> {
  arrangeLibraryItem(LINEAR_AUTH_HEADER);
  mockGetDecryptedEnvVariables.mockResolvedValue(buildEnv({}));
  expect(await callResolve()).toBeNull();
}

async function testNoAuthHeaderReturnsNull(): Promise<void> {
  arrangeLibraryItem({});
  mockGetDecryptedEnvVariables.mockResolvedValue(buildEnv({ LINEAR_API_KEY: 'lin_secret_123' }));
  expect(await callResolve()).toBeNull();
}

async function testRefMappingResolves(): Promise<void> {
  // Header template is {{LINEAR_API_KEY}} but the org secret is named LINEAR_KEY.
  // The installation's variableValues bridges the two via the env var id.
  arrangeLibraryItem(LINEAR_AUTH_HEADER);
  arrangeSecretEnv();
  const token = await callResolve({ variableValues: REF_ENV_1 });
  expect(token).toBe('lin_secret_123');
}

async function testStoredBindingPreferred(): Promise<void> {
  // FE payload has a stripped/empty direct value; the authoritative ref lives
  // in the base graph_mcp_servers binding, loaded server-side by agentId.
  arrangeLibraryItem(LINEAR_AUTH_HEADER);
  arrangeSecretEnv();
  mockGetMcpServerBinding.mockResolvedValue({ serverId: 'srv-1', variableValues: REF_ENV_1 });
  const token = await callResolve({ agentId: 'agent-1', variableValues: EMPTY_DIRECT });
  expect(token).toBe('lin_secret_123');
  expect(mockGetMcpServerBinding).toHaveBeenCalledWith(fakeSupabase, 'agent-1', 'lib-1');
}

async function testTenantOverrideWins(): Promise<void> {
  // Base binding + FE value are both empty; the real ref lives in the default
  // tenant's graph_mcp_server_tenant_config row, which must win (resolveBinding).
  arrangeLibraryItem(LINEAR_AUTH_HEADER);
  arrangeSecretEnv();
  mockGetMcpServerBinding.mockResolvedValue({ serverId: 'srv-1', variableValues: EMPTY_DIRECT });
  mockGetDefaultTenantId.mockResolvedValue('tenant-default');
  mockGetTenantConfigs.mockResolvedValue([buildTenantConfigRow(REF_ENV_1)]);
  const token = await callResolve({ agentId: 'agent-1', variableValues: EMPTY_DIRECT });
  expect(token).toBe('lin_secret_123');
  expect(mockGetTenantConfigs).toHaveBeenCalledWith(fakeSupabase, 'agent-1');
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('resolveStaticToken', () => {
  beforeEach(() => {
    // Defaults: no stored binding / no tenant scope (exercises the FE fallback).
    mockGetMcpServerBinding.mockResolvedValue(undefined);
    mockGetDefaultTenantId.mockResolvedValue(undefined);
    mockGetTenantConfigs.mockResolvedValue([]);
  });

  it('returns the raw token when a Bearer {{VAR}} header resolves to a secret', testHeaderResolvesToSecret);
  it('returns null when the referenced env var is missing', testMissingVarReturnsNull);
  it('returns null when the library item has no Authorization header', testNoAuthHeaderReturnsNull);
  it('resolves a per-installation ref mapping via byId', testRefMappingResolves);
  it('prefers the stored base binding over the degraded FE variableValues', testStoredBindingPreferred);
  it('prefers the default-tenant override over the base binding', testTenantOverrideWins);
});
