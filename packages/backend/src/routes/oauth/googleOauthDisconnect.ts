import type { Request } from 'express';

import { oauthTokenKey } from '../../cache/oauthTokenCache.js';
import { type CacheWrapper, buildUpstashClient, createCache } from '../../cache/redis.js';
import { deleteGoogleConnection } from '../../db/queries/googleOauthConnectionOperations.js';
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

const CALENDAR_PROVIDER_ID = 'calendar';

let cachedCache: CacheWrapper | null = null;
function getCache(): CacheWrapper {
  if (cachedCache !== null) return cachedCache;
  cachedCache = createCache(buildUpstashClient());
  return cachedCache;
}

const CACHE_INVALIDATION_WARNING =
  'Disconnected, but credential cache invalidation failed. Token may remain active for up to 60 seconds.';

export async function handleGoogleDisconnect(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getStringParam(req, 'orgId');
  if (orgId === undefined) {
    sendBadRequest(res, 'orgId query param is required');
    return;
  }

  try {
    const { supabase }: AuthenticatedLocals = res.locals;
    await deleteGoogleConnection(supabase, orgId);
    const invalidation = await getCache().tryDel(oauthTokenKey(orgId, CALENDAR_PROVIDER_ID));
    logOAuthInfo('google-disconnect', `orgId=${orgId} cache_ok=${String(invalidation.ok)}`);
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
    logOAuthError('google-disconnect', message);
    sendInternalError(res, message);
  }
}
