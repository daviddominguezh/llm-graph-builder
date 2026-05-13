import type { Request } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
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

interface ResolveTokenBody {
  orgId?: string;
  libraryItemId?: string;
}

function extractStringField(obj: object, key: string): string | undefined {
  if (!(key in obj)) return undefined;
  const value: unknown = Object.getOwnPropertyDescriptor(obj, key)?.value;
  return typeof value === 'string' ? value : undefined;
}

function parseBody(body: unknown): ResolveTokenBody {
  if (typeof body !== 'object' || body === null) return {};
  return {
    orgId: extractStringField(body, 'orgId'),
    libraryItemId: extractStringField(body, 'libraryItemId'),
  };
}

export async function handleResolveToken(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, libraryItemId } = parseBody(req.body);

  if (orgId === undefined || libraryItemId === undefined) {
    sendBadRequest(res, 'orgId and libraryItemId are required');
    return;
  }

  try {
    logOAuthInfo('resolve-token', `orgId=${orgId} libraryItemId=${libraryItemId}`);
    const { supabase }: AuthenticatedLocals = res.locals;
    const authType = await getLibraryItemAuthType(supabase, libraryItemId);
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
