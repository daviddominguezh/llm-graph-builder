import type { Request } from 'express';

import { getExecutionsForSession } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getSessionIdParam } from './dashboardHelpers.js';

export async function handleGetExecutionsForSession(req: Request, res: AuthenticatedResponse): Promise<void> {
  const sessionId = getSessionIdParam(req);

  if (sessionId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'sessionId is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const { rows, error } = await getExecutionsForSession(supabase, sessionId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(rows);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
