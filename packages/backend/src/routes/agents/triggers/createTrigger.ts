import { TriggerScheduleSchema } from '@openflow/shared-validation/triggers/schedule';
import type { TriggerSchedule, TriggerScheduleInput } from '@openflow/shared-validation/triggers/schedule';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';

import { getAgentById as getAgentByIdQuery } from '../../../db/queries/agentQueries.js';
import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import { type TriggerRow, insertTrigger as insertTriggerQuery } from '../../../db/queries/triggerQueries.js';
import { type SetArmedTaskEpoch, armToward, nextRunFor } from '../../../triggers/fireHelpers.js';
import type { TriggerScheduler } from '../../../triggers/scheduler.js';
import { getTriggerScheduler } from '../../../triggers/schedulerSingleton.js';
import { jitterWindowMs, maxHorizonMs } from '../../../triggers/triggerConfig.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../../routeHelpers.js';
import { toScheduleInput } from './scheduleInput.js';

const EPOCH_TO_MS = 1000;
const MIN_LEN = 1;

const bodySchema = z.object({
  tenantId: z.string().min(MIN_LEN),
  schedule: TriggerScheduleSchema,
  initialMessage: z.string().min(MIN_LEN),
});

export type CreateTriggerBody = z.infer<typeof bodySchema>;

type InsertTrigger = typeof insertTriggerQuery;
type GetAgentById = (
  supabase: SupabaseClient,
  agentId: string
) => Promise<{ result: { org_id: string } | null; error: string | null }>;

export interface CreateTriggerDeps {
  supabase: SupabaseClient;
  scheduler: TriggerScheduler;
  insertTrigger?: InsertTrigger;
  getAgentById?: GetAgentById;
  setArmedTaskEpoch?: SetArmedTaskEpoch;
}

interface CreateResult {
  status: number;
  body: TriggerRow | { error: string };
}

interface ArmContext {
  id: string;
  agentId: string;
  tenantId: string;
  initialMessage: string;
  scheduleInput: TriggerScheduleInput;
  next: Date;
}

async function armFirstTask(deps: CreateTriggerDeps, ctx: ArmContext): Promise<void> {
  await armToward(
    {
      supabase: deps.supabase,
      scheduler: deps.scheduler,
      horizonMs: maxHorizonMs(),
      setArmedTaskEpoch: deps.setArmedTaskEpoch,
    },
    {
      triggerId: ctx.id,
      agentId: ctx.agentId,
      tenantId: ctx.tenantId,
      initialMessage: ctx.initialMessage,
      schedule: ctx.scheduleInput,
    },
    Math.floor(ctx.next.getTime() / EPOCH_TO_MS),
    new Date()
  );
}

async function resolveOrgId(
  deps: CreateTriggerDeps,
  agentId: string
): Promise<{ orgId: string; error: null } | { orgId: null; error: string }> {
  const resolveAgent = deps.getAgentById ?? getAgentByIdQuery;
  const { result: agent, error } = await resolveAgent(deps.supabase, agentId);
  if (error !== null || agent === null) return { orgId: null, error: error ?? 'Agent not found' };
  return { orgId: agent.org_id, error: null };
}

async function createTrigger(
  deps: CreateTriggerDeps,
  agentId: string,
  body: CreateTriggerBody
): Promise<CreateResult> {
  const { orgId, error: orgError } = await resolveOrgId(deps, agentId);
  if (orgId === null) return { status: HTTP_NOT_FOUND, body: { error: orgError } };
  const id = crypto.randomUUID();
  const schedule: TriggerSchedule = body.schedule;
  const scheduleInput = toScheduleInput(schedule);
  const next = nextRunFor(scheduleInput, new Date(), id, jitterWindowMs());
  const insert = deps.insertTrigger ?? insertTriggerQuery;
  const { result, error } = await insert(deps.supabase, {
    id,
    agentId,
    tenantId: body.tenantId,
    orgId,
    schedule,
    initialMessage: body.initialMessage,
    nextRunAt: next,
    armedTaskEpoch: null,
  });
  if (error !== null || result === null) {
    return { status: HTTP_INTERNAL_ERROR, body: { error: error ?? 'Failed to create trigger' } };
  }
  const { tenantId, initialMessage } = body;
  if (next !== null) {
    await armFirstTask(deps, { id, agentId, tenantId, initialMessage, scheduleInput, next });
  }
  return { status: HTTP_OK, body: result };
}

export function createCreateTriggerHandler(deps: CreateTriggerDeps) {
  return async function handle(req: Request, res: AuthenticatedResponse): Promise<void> {
    const agentId = getAgentId(req);
    if (agentId === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
      return;
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid trigger body' });
      return;
    }
    try {
      const { status, body } = await createTrigger(deps, agentId, parsed.data);
      res.status(status).json(body);
    } catch (err) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
    }
  };
}

export async function handleCreateTrigger(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const handler = createCreateTriggerHandler({ supabase, scheduler: getTriggerScheduler() });
  await handler(req, res);
}

export { createTrigger };
