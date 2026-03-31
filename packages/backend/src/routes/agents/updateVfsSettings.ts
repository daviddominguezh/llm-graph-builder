import type { Request } from 'express';
import { z } from 'zod';

import { updateAgentVfsSettings } from '../../db/queries/vfsConfigQueries.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_INTERNAL_ERROR, HTTP_NOT_FOUND, extractErrorMessage, getAgentId } from '../routeHelpers.js';

const HTTP_BAD_REQUEST = 400;

const VfsSettingsSchema = z
  .object({
    enabled: z.literal(true),
    protectedPaths: z.array(z.string()).optional(),
    searchCandidateLimit: z.number().positive().optional(),
    readLineCeiling: z.number().positive().optional(),
    rateLimitThreshold: z.number().positive().optional(),
  })
  .nullable();

export async function handleUpdateVfsSettings(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  const parsed = VfsSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }

  try {
    await updateAgentVfsSettings(supabase, agentId, parsed.data);
    res.json({ settings: parsed.data });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
