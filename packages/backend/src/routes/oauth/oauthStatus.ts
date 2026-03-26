import type { Request } from 'express';

import { getConnectionStatus } from '../../db/queries/oauthConnectionOperations.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  getStringParam,
  logOAuthError,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

export async function handleStatus(req: Request, res: AuthenticatedResponse): Promise<void> {
  const orgId = getStringParam(req, 'orgId');
  const libraryItemId = getStringParam(req, 'libraryItemId');

  if (orgId === undefined || libraryItemId === undefined) {
    sendBadRequest(res, 'orgId and libraryItemId query params are required');
    return;
  }

  try {
    const { supabase }: AuthenticatedLocals = res.locals;
    const status = await getConnectionStatus(supabase, orgId, libraryItemId);
    res.status(HTTP_OK).json(status);
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('status', message);
    sendInternalError(res, message);
  }
}
