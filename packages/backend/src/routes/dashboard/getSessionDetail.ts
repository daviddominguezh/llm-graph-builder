import type { Request } from 'express';

import { getSessionDetail } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getSessionIdParam } from './dashboardHelpers.js';

export async function handleGetSessionDetail(req: Request, res: AuthenticatedResponse): Promise<void> {
  const sessionId = getSessionIdParam(req);

  if (sessionId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'sessionId is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const { session, error } = await getSessionDetail(supabase, sessionId);

    if (error !== null || session === null) {
      res.status(HTTP_NOT_FOUND).json({ error: error ?? 'Session not found' });
      return;
    }

    res.status(HTTP_OK).json(session);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
