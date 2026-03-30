import type { Request } from 'express';

import { getMessagesForExecution } from '../../db/queries/dashboardQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getExecutionIdParam } from './dashboardHelpers.js';

export async function handleGetExecutionMessages(req: Request, res: AuthenticatedResponse): Promise<void> {
  const executionId = getExecutionIdParam(req);

  if (executionId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'executionId is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const { rows, error } = await getMessagesForExecution(supabase, executionId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(rows);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
