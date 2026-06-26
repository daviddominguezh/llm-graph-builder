import type { Request } from 'express';

import { deleteTrigger, getTriggerById } from '../../../db/queries/triggerQueries.js';
import { getTriggerScheduler } from '../../../triggers/schedulerSingleton.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  extractErrorMessage,
  getAgentId,
} from '../../routeHelpers.js';
import { cancelArmedTask, getTriggerId } from './triggerParams.js';

const HTTP_NO_CONTENT = 204;

export async function handleDeleteTrigger(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentId = getAgentId(req);
  const triggerId = getTriggerId(req);
  if (agentId === undefined || triggerId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and trigger ID are required' });
    return;
  }

  try {
    const { result: row } = await getTriggerById(supabase, triggerId);
    if (row !== null) await cancelArmedTask(getTriggerScheduler(), triggerId, row.armed_task_epoch);
    const { error } = await deleteTrigger(supabase, agentId, triggerId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_NO_CONTENT).send();
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
