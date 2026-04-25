import type { Request } from 'express';

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

export async function handleGoogleDisconnect(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getStringParam(req, 'orgId');
  if (orgId === undefined) {
    sendBadRequest(res, 'orgId query param is required');
    return;
  }

  try {
    const { supabase }: AuthenticatedLocals = res.locals;
    await deleteGoogleConnection(supabase, orgId);
    logOAuthInfo('google-disconnect', `orgId=${orgId}`);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('google-disconnect', message);
    sendInternalError(res, message);
  }
}
