import { OperationsBatchSchema } from '@daviddh/graph-types';
import type { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';

import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';

type SupabaseClient = ReturnType<typeof createClient>;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

interface AuthenticatedLocals extends Record<string, unknown> {
  supabase: SupabaseClient;
  userId: string;
}

type AuthenticatedResponse = Response<unknown, AuthenticatedLocals>;

interface AgentParams {
  agentId?: string | string[];
}

function getAgentId(req: Request): string | undefined {
  const { agentId }: AgentParams = req.params;
  if (typeof agentId === 'string') return agentId;
  return undefined;
}

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
