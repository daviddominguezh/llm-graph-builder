import {
  type TriggerScheduleInput,
  applyJitter,
  computeNextRunAt,
} from '@openflow/shared-validation/triggers/schedule';

import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import { setArmedTaskEpoch as setArmedTaskEpochQuery } from '../db/queries/triggerQueries.js';
import type { AgentExecutionInput } from '../routes/execute/executeTypes.js';
import type { TriggerScheduler, TriggerTaskPayload } from './scheduler.js';

const MS = 1000;

/** Next occurrence anchored on the CURRENT occurrence (not wall-clock), so two
 *  deliveries compute the same `next` → the re-armed task is name-idempotent.
 *  Jitter applies to recurring only. */
export function nextRunFor(
  schedule: TriggerScheduleInput,
  anchor: Date,
  triggerId: string,
  jitterWindowMs: number
): Date | null {
  const next = computeNextRunAt(schedule, anchor);
  if (next === null) return null;
  return schedule.mode === 'recurring' ? applyJitter(next, triggerId, jitterWindowMs) : next;
}

/** Trigger runs always use the api channel, non-streaming, the default user and a
 *  fresh session. The published production version is resolved separately. */
export function buildTriggerInput(
  payload: TriggerTaskPayload,
  sessionId: string,
  defaultUserId: string
): AgentExecutionInput {
  return {
    tenantId: payload.tenantId,
    userId: defaultUserId,
    sessionId,
    message: { text: payload.initialMessage },
    channel: 'api',
    stream: false,
  };
}

/** Base payload fields shared by every task of a trigger (no per-occurrence fields). */
export type TaskBase = Pick<
  TriggerTaskPayload,
  'triggerId' | 'agentId' | 'tenantId' | 'initialMessage' | 'schedule'
>;

export function baseOf(p: TriggerTaskPayload): TaskBase {
  return {
    triggerId: p.triggerId,
    agentId: p.agentId,
    tenantId: p.tenantId,
    initialMessage: p.initialMessage,
    schedule: p.schedule,
  };
}

/** Injected so the handler/helpers stay DB-free under test. */
export type SetArmedTaskEpoch = (
  supabase: SupabaseClient,
  triggerId: string,
  hopEpoch: number | null
) => Promise<void>;

export interface ArmDeps {
  supabase: SupabaseClient;
  scheduler: TriggerScheduler;
  horizonMs: number;
  setArmedTaskEpoch?: SetArmedTaskEpoch;
}

/** Arm the task that moves a trigger toward `targetEpoch`. If the target is
 *  within `horizonMs`, arm the REAL fire (hopEpoch === targetEpoch); otherwise
 *  arm a continuation HOP at now+horizon (hopEpoch < targetEpoch). Adapter-
 *  agnostic — both Cloud Tasks and the local timer get the hop for free. Also
 *  records the armed hopEpoch for exact cancel. */
export async function armToward(
  deps: ArmDeps,
  base: TaskBase,
  targetEpoch: number,
  now: Date
): Promise<void> {
  const targetMs = targetEpoch * MS;
  const withinHorizon = targetMs - now.getTime() <= deps.horizonMs;
  const runAt = withinHorizon ? new Date(targetMs) : new Date(now.getTime() + deps.horizonMs);
  const hopEpoch = Math.floor(runAt.getTime() / MS);
  await deps.scheduler.schedule({ runAt, payload: { ...base, targetEpoch, hopEpoch } });
  const setArmed = deps.setArmedTaskEpoch ?? setArmedTaskEpochQuery;
  await setArmed(deps.supabase, base.triggerId, hopEpoch);
}
