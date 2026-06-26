import type { Request } from 'express';

import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  type TriggerRow,
  getTriggerById,
  setNextRunAt,
  setTriggerEnabled,
} from '../../../db/queries/triggerQueries.js';
import { armToward, nextRunFor } from '../../../triggers/fireHelpers.js';
import { getTriggerScheduler } from '../../../triggers/schedulerSingleton.js';
import { jitterWindowMs, maxHorizonMs } from '../../../triggers/triggerConfig.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../../routeHelpers.js';
import { scheduleInputFromRow } from './rowSchedule.js';
import { cancelArmedTask, getTriggerId } from './triggerParams.js';

const EPOCH_TO_MS = 1000;

type GetTriggerById = typeof getTriggerById;

export interface SetTriggerEnabledDeps {
  getTriggerById?: GetTriggerById;
}

function parseEnabled(body: unknown): boolean | undefined {
  if (typeof body !== 'object' || body === null || !('enabled' in body)) return undefined;
  const { enabled } = body as { enabled: unknown };
  return typeof enabled === 'boolean' ? enabled : undefined;
}

async function rearm(supabase: SupabaseClient, agentId: string, row: TriggerRow): Promise<void> {
  const scheduleInput = scheduleInputFromRow(row);
  const next = nextRunFor(scheduleInput, new Date(), row.id, jitterWindowMs());
  if (next === null) return;
  await armToward(
    { supabase, scheduler: getTriggerScheduler(), horizonMs: maxHorizonMs() },
    {
      triggerId: row.id,
      agentId,
      tenantId: row.tenant_id,
      initialMessage: row.initial_message,
      schedule: scheduleInput,
    },
    Math.floor(next.getTime() / EPOCH_TO_MS),
    new Date()
  );
  await setNextRunAt(supabase, row.id, next);
}

async function applyEnabled(
  supabase: SupabaseClient,
  agentId: string,
  row: TriggerRow,
  enabled: boolean
): Promise<{ error: string | null }> {
  if (!enabled) await cancelArmedTask(getTriggerScheduler(), row.id, row.armed_task_epoch);
  const { error } = await setTriggerEnabled(supabase, agentId, row.id, enabled);
  if (error !== null) return { error };
  if (enabled) await rearm(supabase, agentId, row);
  return { error: null };
}

async function readPostMutationRow(
  read: GetTriggerById,
  supabase: SupabaseClient,
  triggerId: string,
  fallback: TriggerRow
): Promise<TriggerRow> {
  const { result, error } = await read(supabase, triggerId);
  if (error !== null || result === null) return fallback;
  return result;
}

function createSetTriggerEnabledHandler(deps: SetTriggerEnabledDeps = {}) {
  const read = deps.getTriggerById ?? getTriggerById;
  return async function handle(req: Request, res: AuthenticatedResponse): Promise<void> {
    const { supabase }: AuthenticatedLocals = res.locals;
    const agentId = getAgentId(req);
    const triggerId = getTriggerId(req);
    const enabled = parseEnabled(req.body);
    if (agentId === undefined || triggerId === undefined || enabled === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID, trigger ID and enabled flag are required' });
      return;
    }
    try {
      await runSetTriggerEnabled(read, { supabase, agentId, triggerId, enabled }, res);
    } catch (err) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
    }
  };
}

interface SetEnabledContext {
  supabase: SupabaseClient;
  agentId: string;
  triggerId: string;
  enabled: boolean;
}

async function runSetTriggerEnabled(
  read: GetTriggerById,
  ctx: SetEnabledContext,
  res: AuthenticatedResponse
): Promise<void> {
  const { result: row } = await read(ctx.supabase, ctx.triggerId);
  if (row === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Trigger not found' });
    return;
  }
  const { error } = await applyEnabled(ctx.supabase, ctx.agentId, row, ctx.enabled);
  if (error !== null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error });
    return;
  }
  const fresh = await readPostMutationRow(read, ctx.supabase, ctx.triggerId, {
    ...row,
    enabled: ctx.enabled,
  });
  res.status(HTTP_OK).json(fresh);
}

export async function handleSetTriggerEnabled(req: Request, res: AuthenticatedResponse): Promise<void> {
  await createSetTriggerEnabledHandler()(req, res);
}

export { createSetTriggerEnabledHandler };
