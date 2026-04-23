import type { Request } from 'express';

import type { ExecutionKeyAgent, ExecutionKeyRow } from '../../db/queries/executionKeyQueries.js';
import { getAgentsForKey, getExecutionKeysByOrg } from '../../db/queries/executionKeyQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam } from './secretsHelpers.js';

interface KeyWithAgents extends ExecutionKeyRow {
  agents: ExecutionKeyAgent[];
}

async function attachAgents(
  supabase: AuthenticatedLocals['supabase'],
  keys: ExecutionKeyRow[]
): Promise<KeyWithAgents[]> {
  const enriched = await Promise.all(
    keys.map(async (key) => {
      const { result } = await getAgentsForKey(supabase, key.id);
      return { ...key, agents: result };
    })
  );
  return enriched;
}

export async function handleGetExecutionKeysWithAgents(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgIdParam(req);
  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }
  try {
    const { result: keys, error } = await getExecutionKeysByOrg(supabase, orgId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    const enriched = await attachAgents(supabase, keys);
    res.status(HTTP_OK).json(enriched);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
