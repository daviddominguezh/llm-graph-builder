import type { Request } from 'express';

import { updateStagingKeyId } from '../../db/queries/agentQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';
import { parseNullableStringField } from './agentCrudHelpers.js';

const KEY_ID_FIELD = 'keyId';

export async function handleSaveStagingKey(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const keyId = parseNullableStringField(req.body, KEY_ID_FIELD);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  if (keyId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'keyId is required (string or null)' });
    return;
  }

  try {
    const { error } = await updateStagingKeyId(supabase, agentId, keyId);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
