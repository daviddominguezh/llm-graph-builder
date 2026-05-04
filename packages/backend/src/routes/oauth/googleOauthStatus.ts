import type { Request } from 'express';

import { getGoogleConnectionStatus } from '../../db/queries/googleOauthConnectionOperations.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  getStringParam,
  logOAuthError,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

export async function handleGoogleStatus(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getStringParam(req, 'orgId');
  if (orgId === undefined) {
    sendBadRequest(res, 'orgId query param is required');
    return;
  }

  try {
    const { supabase }: AuthenticatedLocals = res.locals;
    const status = await getGoogleConnectionStatus(supabase, orgId);
    res.status(HTTP_OK).json(status);
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('google-status', message);
    sendInternalError(res, message);
  }
}
