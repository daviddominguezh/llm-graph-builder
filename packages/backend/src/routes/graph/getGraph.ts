import type { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';

import { assembleGraph } from '../../db/queries/graphQueries.js';

type SupabaseClient = ReturnType<typeof createClient>;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
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
  process.stderr.write(`[getGraph] ERROR agent=${agentId}: ${message}\n`);
}

export async function handleGetGraph(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const { supabase }: AuthenticatedLocals = res.locals;

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const graph = await assembleGraph(supabase, agentId);

    if (graph === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
      return;
    }

    res.status(HTTP_OK).json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
