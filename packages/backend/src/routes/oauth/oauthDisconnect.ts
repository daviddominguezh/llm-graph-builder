import type { Request } from 'express';

import { deleteConnection } from '../../db/queries/oauthConnectionOperations.js';
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
    logOAuthInfo('disconnect', `orgId=${orgId} libraryItemId=${libraryItemId}`);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('disconnect', message);
    sendInternalError(res, message);
  }
}
