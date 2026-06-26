import type { Request } from 'express';

import { oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { type CacheWrapper, buildUpstashClient, createCache } from '../../cache/redis.js';
import { deleteConnection } from '../../db/queries/oauthConnectionOperations.js';
import { mcpOAuthProviderId } from '../../mcp/oauth/tokenRefresh.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  getStringParam,
  logOAuthError,
  logOAuthInfo,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

let cachedCache: CacheWrapper | null = null;
function getCache(): CacheWrapper {
  if (cachedCache !== null) return cachedCache;
  cachedCache = createCache(buildUpstashClient());
  return cachedCache;
}

const CACHE_INVALIDATION_WARNING =
  'Disconnected, but credential cache invalidation failed. Token may remain active for up to 60 seconds.';

export async function handleDisconnect(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getStringParam(req, 'orgId');
  const libraryItemId = getStringParam(req, 'libraryItemId');

  if (orgId === undefined || libraryItemId === undefined) {
    sendBadRequest(res, 'orgId and libraryItemId query params are required');
    return;
  }

  try {
    const { supabase }: AuthenticatedLocals = res.locals;
    await deleteConnection(supabase, orgId, libraryItemId);
    const invalidation = await getCache().tryDel(oauthTokenKey(orgId, mcpOAuthProviderId(libraryItemId)));
    logOAuthInfo(
      'disconnect',
      `orgId=${orgId} libraryItemId=${libraryItemId} cache_ok=${String(invalidation.ok)}`
    );
    if (!invalidation.ok) {
      res.status(HTTP_OK).json({
        success: true,
        warning: { kind: 'cache_invalidation_failed', message: CACHE_INVALIDATION_WARNING },
      });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('disconnect', message);
    sendInternalError(res, message);
  }
}
