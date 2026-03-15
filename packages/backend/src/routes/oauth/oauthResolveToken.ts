import type { Request } from 'express';

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
    const mcpServerUrl = await lookupMcpServerUrl(supabase, libraryItemId);
    const accessToken = await resolveAccessToken(supabase, orgId, libraryItemId, mcpServerUrl);
    res.status(HTTP_OK).json({ accessToken });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('resolve-token', message);
    sendInternalError(res, message);
  }
}
