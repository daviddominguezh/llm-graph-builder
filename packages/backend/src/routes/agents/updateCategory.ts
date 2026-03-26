import { TemplateCategorySchema } from '@daviddh/graph-types';
import type { Request } from 'express';

import { updateAgentCategory } from '../../db/queries/agentQueries.js';
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

function parseCategoryField(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if (!('category' in body)) return undefined;
  const { category } = body;
  const parsed = TemplateCategorySchema.safeParse(category);
  if (parsed.success) return parsed.data;
  return undefined;
}

export async function handleUpdateCategory(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const category = parseCategoryField(req.body);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  if (category === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'A valid category is required' });
    return;
  }

  try {
    const { error } = await updateAgentCategory(supabase, agentId, category);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    await updateTemplateMetadata(supabase, agentId, { category });
    res.status(HTTP_OK).json({ category });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
