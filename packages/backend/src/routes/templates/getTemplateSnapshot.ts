import type { Request } from 'express';

import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTemplateAgentId, getTemplateVersion } from './templateHelpers.js';

/**
 * Try reading the cached template_graph_data from agent_templates.
 * This table has public SELECT RLS, so any authenticated user can read it.
 * Only works for the latest version stored in the template.
 */
async function getFromTemplateCache(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<object | null> {
  const { data, error } = await supabase
    .from('agent_templates')
    .select('template_graph_data, latest_version')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error !== null || data === null) return null;
  if (data.latest_version !== version) return null;
  const graphData: unknown = data.template_graph_data;
  if (typeof graphData !== 'object' || graphData === null) return null;
  return graphData;
}

export async function handleGetTemplateSnapshot(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getTemplateAgentId(req);
  const version = getTemplateVersion(req);

  if (agentId === undefined || version === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Missing agentId or version' });
    return;
  }

  try {
    // First try the public template cache (works for any authenticated user)
    const cached = await getFromTemplateCache(supabase, agentId, version);
    if (cached !== null) {
      res.status(HTTP_OK).json(cached);
      return;
    }

    // Fall back to assembling from agent_versions (requires org membership)
    const graph = await assembleTemplateSafeGraph(supabase, agentId, version);

    if (graph === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Version not found' });
      return;
    }

    res.status(HTTP_OK).json(graph);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
