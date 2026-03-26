import type { Request } from 'express';

import { updateAgentMetadata } from '../../db/queries/agentQueries.js';
import { updateTemplateMetadata } from '../../db/queries/templateQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';
import { parseStringField } from './agentCrudHelpers.js';

export async function handleUpdateMetadata(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const description = parseStringField(req.body, 'description');

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  if (description === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'description is required' });
    return;
  }

  try {
    const { error } = await updateAgentMetadata(supabase, agentId, { description });

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    await updateTemplateMetadata(supabase, agentId, { description });
    res.status(HTTP_OK).json({ description });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
