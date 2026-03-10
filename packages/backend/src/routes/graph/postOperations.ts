import { OperationsBatchSchema } from '@daviddh/graph-types';
import type { Request, Response } from 'express';

import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

function logError(agentId: string, message: string): void {
  process.stderr.write(`[postOperations] ERROR agent=${agentId}: ${message}\n`);
}

function sendBadRequest(res: Response, message: string): void {
  res.status(HTTP_BAD_REQUEST).json({ error: message });
}

export async function handlePostOperations(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    sendBadRequest(res, 'Agent ID is required');
    return;
  }

  const parsed = OperationsBatchSchema.safeParse(req.body);

  if (!parsed.success) {
    sendBadRequest(res, parsed.error.message);
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    await executeOperationsBatch(supabase, agentId, parsed.data.operations);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
