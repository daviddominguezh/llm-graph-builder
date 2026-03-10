import type { Request } from 'express';

import { getVersionSnapshot } from '../../db/queries/versionQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

interface VersionParams {
  version?: string | string[];
}

function parseVersionParam(req: Request): number | undefined {
  const { version }: VersionParams = req.params;
  if (typeof version !== 'string') return undefined;

  const parsed = Number.parseInt(version, 10);
  if (Number.isNaN(parsed)) return undefined;

  return parsed;
}

function logError(agentId: string, message: string): void {
  process.stderr.write(`[getVersion] ERROR agent=${agentId}: ${message}\n`);
}

export async function handleGetVersion(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const version = parseVersionParam(req);

  if (agentId === undefined || version === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and version are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const graph = await getVersionSnapshot(supabase, agentId, version);

    if (graph === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Version not found' });
      return;
    }

    res.status(HTTP_OK).json(graph);
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
