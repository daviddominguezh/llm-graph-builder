import type { Request } from 'express';

import { updateAgentVisibility } from '../../db/queries/agentQueries.js';
import { syncTemplateOnPublicToggle } from '../../db/queries/templateSync.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

function parseBooleanField(body: unknown): boolean | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if (!('isPublic' in body)) return undefined;
  const { isPublic } = body;
  if (typeof isPublic === 'boolean') return isPublic;
  return undefined;
}

async function applyVisibility(
  supabase: AuthenticatedLocals['supabase'],
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  const { error } = await updateAgentVisibility(supabase, agentId, isPublic);
  if (error !== null) return { error };

  const syncResult = await syncTemplateOnPublicToggle(supabase, agentId, isPublic);
  if (syncResult.error !== null) {
    await updateAgentVisibility(supabase, agentId, !isPublic);
    return { error: syncResult.error };
  }

  return { error: null };
}

export async function handleUpdateVisibility(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const isPublic = parseBooleanField(req.body);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  if (isPublic === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'isPublic (boolean) is required' });
    return;
  }

  try {
    const { error } = await applyVisibility(supabase, agentId, isPublic);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ isPublic });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
