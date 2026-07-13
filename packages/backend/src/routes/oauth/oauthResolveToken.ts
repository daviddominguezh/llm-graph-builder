import {
  buildResolvedVars,
  type McpTransport,
  resolveTransport,
  type VariableValue,
  VariableValueSchema,
} from '@daviddh/graph-types';
import type { Request } from 'express';
import { z } from 'zod';

import { getDecryptedEnvVariables } from '../../db/queries/executionAuthQueries.js';
import { getLibraryItemById, parseLibraryTransport } from '../../db/queries/mcpLibraryQueries.js';
import { getMcpServerBinding } from '../../db/queries/mcpServerOperations.js';
import { getTenantConfigs } from '../../db/queries/mcpTenantConfigQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getDefaultTenantId } from '../../db/queries/tenantQueries.js';
import { resolveAccessToken } from '../../mcp/oauth/tokenRefresh.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  logOAuthError,
  logOAuthInfo,
  lookupMcpServerUrl,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

async function getLibraryItemAuthType(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<string | null> {
  const result = await supabase.from('mcp_library').select('auth_type').eq('id', libraryItemId).maybeSingle();
  if (result.error !== null || result.data === null) return null;
  const { auth_type: authType } = result.data as { auth_type: string | null };
  return authType;
}

function findAuthorizationHeader(headers: Record<string, string> | undefined): string | undefined {
  if (headers === undefined) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') return value;
  }
  return undefined;
}

function extractResolvedToken(transport: McpTransport): string | null {
  // Only http/sse transports carry an Authorization header; stdio has none.
  if (transport.type === 'stdio') return null;
  const header = findAuthorizationHeader(transport.headers);
  if (header === undefined) return null;
  // The FE proxy re-adds `Bearer `, so strip a leading (case-insensitive) one here.
  const token = header.replace(/^Bearer\s+/iv, '').trim();
  // Empty or an unresolved `{{VAR}}` template means "no usable token".
  if (token === '' || token.includes('{{')) return null;
  return token;
}

export interface StaticTokenRequest {
  supabase: SupabaseClient;
  orgId: string;
  libraryItemId: string;
  // The owning agent, used to load the authoritative stored variable bindings.
  agentId: string | undefined;
  // The FE-supplied bindings; a degraded fallback (secret refs are stripped
  // client-side), used only when no stored binding exists.
  variableValues: Record<string, VariableValue> | undefined;
}

type EffectiveVars = Record<string, VariableValue> | undefined;

// Tenant override for a server, mirroring resolveBinding: the default tenant's
// `graph_mcp_server_tenant_config` row wins over the base binding when present.
async function loadTenantVars(
  supabase: SupabaseClient,
  agentId: string,
  serverId: string,
  tenantId: string | undefined
): Promise<Record<string, VariableValue> | undefined> {
  if (tenantId === undefined) return undefined;
  const configs = await getTenantConfigs(supabase, agentId);
  const row = configs.find((c) => c.server_id === serverId && c.tenant_id === tenantId);
  return row?.variable_values;
}

/**
 * Authoritative variable bindings, resolved server-side (the FE strips secret
 * `env_ref`s). Base = `graph_mcp_servers.variable_values`; the default tenant's
 * `graph_mcp_server_tenant_config` row overrides it. Falls back to the
 * FE-supplied `variableValues` only when no stored binding exists.
 */
async function resolveEffectiveVars(req: StaticTokenRequest): Promise<EffectiveVars> {
  const { supabase, orgId, agentId, libraryItemId, variableValues } = req;
  if (agentId === undefined) return variableValues;
  const binding = await getMcpServerBinding(supabase, agentId, libraryItemId);
  if (binding === undefined) return variableValues;
  const defaultTenant = await getDefaultTenantId(supabase, orgId);
  const tenantVars = await loadTenantVars(supabase, agentId, binding.serverId, defaultTenant);
  return tenantVars ?? binding.variableValues;
}

/**
 * Resolve the static bearer token for an `auth_type='token'` MCP library item.
 * The token lives in a secret `org_env_variables` row referenced by a `{{VAR}}`
 * template in the transport's Authorization header. Returns the raw token
 * (no `Bearer ` prefix) or null when it can't be resolved.
 */
export async function resolveStaticToken(req: StaticTokenRequest): Promise<string | null> {
  const { supabase, orgId, libraryItemId } = req;
  const { result, error } = await getLibraryItemById(supabase, libraryItemId);
  if (error !== null || result === null) return null;
  const transport = parseLibraryTransport(result);
  if (transport === null) return null;
  const effective = await resolveEffectiveVars(req);
  const env = await getDecryptedEnvVariables(supabase, orgId);
  const resolved = resolveTransport(transport, buildResolvedVars(effective, env));
  return extractResolvedToken(resolved);
}

interface ResolveTokenBody {
  orgId?: string;
  libraryItemId?: string;
  agentId?: string;
  variableValues?: Record<string, VariableValue>;
}

function extractStringField(obj: object, key: string): string | undefined {
  if (!(key in obj)) return undefined;
  const value: unknown = Object.getOwnPropertyDescriptor(obj, key)?.value;
  return typeof value === 'string' ? value : undefined;
}

function extractVariableValues(obj: object): Record<string, VariableValue> | undefined {
  if (!('variableValues' in obj)) return undefined;
  const raw: unknown = Object.getOwnPropertyDescriptor(obj, 'variableValues')?.value;
  const schema = z.record(z.string(), VariableValueSchema).optional();
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

function parseBody(body: unknown): ResolveTokenBody {
  if (typeof body !== 'object' || body === null) return {};
  return {
    orgId: extractStringField(body, 'orgId'),
    libraryItemId: extractStringField(body, 'libraryItemId'),
    agentId: extractStringField(body, 'agentId'),
    variableValues: extractVariableValues(body),
  };
}

async function respondWithStaticToken(res: AuthenticatedResponse, req: StaticTokenRequest): Promise<void> {
  const token = await resolveStaticToken(req);
  res.status(HTTP_OK).json(token === null ? {} : { accessToken: token });
}

export async function handleResolveToken(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, libraryItemId, agentId, variableValues } = parseBody(req.body);

  if (orgId === undefined || libraryItemId === undefined) {
    sendBadRequest(res, 'orgId and libraryItemId are required');
    return;
  }

  try {
    logOAuthInfo('resolve-token', `orgId=${orgId} libraryItemId=${libraryItemId}`);
    const { supabase }: AuthenticatedLocals = res.locals;
    const authType = await getLibraryItemAuthType(supabase, libraryItemId);
    if (authType === 'token') {
      await respondWithStaticToken(res, { supabase, orgId, libraryItemId, agentId, variableValues });
      return;
    }
    if (authType !== 'oauth') {
      // Library item doesn't use OAuth (e.g. bearer-key MCP). The frontend's
      // discover/tool-call proxies fire resolve-token unconditionally whenever
      // a libraryItemId is present. Return an empty body so their
      // `data.accessToken === undefined` guard short-circuits and they fall
      // through to the graph's own transport headers (e.g. an env-var-injected
      // Authorization header). Returning `{ accessToken: null }` would slip
      // past that guard and produce `Bearer null` on the wire.
      res.status(HTTP_OK).json({});
      return;
    }
    const mcpServerUrl = await lookupMcpServerUrl(supabase, libraryItemId);
    const accessToken = await resolveAccessToken(supabase, orgId, libraryItemId, mcpServerUrl);
    res.status(HTTP_OK).json({ accessToken });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('resolve-token', message);
    sendInternalError(res, message);
  }
}
