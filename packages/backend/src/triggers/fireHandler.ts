import { withAbortTimeout } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { getAgentById as getAgentByIdQuery } from '../db/queries/agentQueries.js';
import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import {
  type RecordOutcomeParams,
  claimAndRearm as claimAndRearmQuery,
  isTriggerEnabled as isTriggerEnabledQuery,
  recordOutcome as recordOutcomeQuery,
  setArmedTaskEpoch as setArmedTaskEpochQuery,
} from '../db/queries/triggerQueries.js';
import { executeAgentCore } from '../routes/execute/executeCore.js';
import type { AgentExecutionInput } from '../routes/execute/executeTypes.js';
import { type SetArmedTaskEpoch, armToward, baseOf, buildTriggerInput, nextRunFor } from './fireHelpers.js';
import type { TriggerScheduler, TriggerTaskPayload } from './scheduler.js';

const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const EPOCH_TO_MS = 1000;

interface ExecCtx {
  orgId: string;
  agentId: string;
  version: number;
}
type Execute = (ctx: ExecCtx, input: AgentExecutionInput) => Promise<void>;

type ClaimAndRearm = (
  supabase: SupabaseClient,
  triggerId: string,
  scheduledFor: Date,
  nextRunAt: Date | null
) => Promise<{ result: { runId: string; sessionId: string } | null; error: string | null }>;

type RecordOutcome = (
  supabase: SupabaseClient,
  outcome: RecordOutcomeParams
) => Promise<{ error: string | null }>;

type IsTriggerEnabled = (supabase: SupabaseClient, triggerId: string) => Promise<boolean>;

type GetAgentById = (
  supabase: SupabaseClient,
  agentId: string
) => Promise<{ result: { org_id: string; current_version: number } | null; error: string | null }>;

export interface FireDeps {
  supabase: SupabaseClient;
  scheduler: TriggerScheduler;
  defaultUserId: string;
  jitterWindowMs: number;
  execTimeoutMs: number;
  horizonMs: number;
  execute?: Execute;
  claimAndRearm?: ClaimAndRearm;
  recordOutcome?: RecordOutcome;
  isTriggerEnabled?: IsTriggerEnabled;
  setArmedTaskEpoch?: SetArmedTaskEpoch;
  getAgentById?: GetAgentById;
}

function defaultExecute(supabase: SupabaseClient): Execute {
  return async (ctx, input) => {
    await executeAgentCore({
      supabase,
      orgId: ctx.orgId,
      agentId: ctx.agentId,
      version: ctx.version,
      input,
    });
  };
}

/** Reject as soon as the budget's signal aborts (the run itself can't be cancelled). */
async function abortRejection(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener(
    'abort',
    () => {
      reject(new Error('trigger run timeout'));
    },
    { once: true }
  );
  return await promise;
}

async function withTimeout(run: Promise<void>, ms: number): Promise<void> {
  await withAbortTimeout(ms, async (signal) => {
    await Promise.race([run, abortRejection(signal)]);
  });
}

function armDeps(deps: FireDeps): {
  supabase: SupabaseClient;
  scheduler: TriggerScheduler;
  horizonMs: number;
  setArmedTaskEpoch?: SetArmedTaskEpoch;
} {
  return {
    supabase: deps.supabase,
    scheduler: deps.scheduler,
    horizonMs: deps.horizonMs,
    setArmedTaskEpoch: deps.setArmedTaskEpoch ?? setArmedTaskEpochQuery,
  };
}

async function runAndRecord(
  deps: FireDeps,
  payload: TriggerTaskPayload,
  runId: string,
  sessionId: string
): Promise<void> {
  const exec = deps.execute ?? defaultExecute(deps.supabase);
  const record = deps.recordOutcome ?? recordOutcomeQuery;
  const resolve = deps.getAgentById ?? getAgentByIdQuery;
  try {
    const { result, error } = await resolve(deps.supabase, payload.agentId);
    if (error !== null || result === null) throw new Error(`agent ${payload.agentId} not found`);
    const ctx = { orgId: result.org_id, agentId: payload.agentId, version: result.current_version };
    const input = buildTriggerInput(payload, sessionId, deps.defaultUserId);
    await withTimeout(exec(ctx, input), deps.execTimeoutMs);
    await record(deps.supabase, { runId, status: 'succeeded' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await record(deps.supabase, {
      runId,
      status: 'failed',
      failureReason: 'execution_error',
      error: message,
    });
  }
}

function hasStringField(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string';
}

function hasNumberField(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'number';
}

function hasScheduleField(record: Record<string, unknown>): boolean {
  const { schedule } = record;
  return typeof schedule === 'object' && schedule !== null;
}

function isTriggerTaskPayload(
  record: Record<string, unknown>
): record is TriggerTaskPayload & Record<string, unknown> {
  const strings = ['triggerId', 'agentId', 'tenantId', 'initialMessage'];
  const numbers = ['targetEpoch', 'hopEpoch'];
  return (
    strings.every((key) => hasStringField(record, key)) &&
    numbers.every((key) => hasNumberField(record, key)) &&
    hasScheduleField(record)
  );
}

function parsePayload(body: unknown): TriggerTaskPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const record: Record<string, unknown> = { ...body };
  return isTriggerTaskPayload(record) ? record : null;
}

async function handleContinuation(deps: FireDeps, p: TriggerTaskPayload, res: Response): Promise<void> {
  const enabled = deps.isTriggerEnabled ?? isTriggerEnabledQuery;
  if (await enabled(deps.supabase, p.triggerId)) {
    await armToward(armDeps(deps), baseOf(p), p.targetEpoch, new Date());
  }
  res.status(HTTP_OK).json({ ok: true, continuation: true });
}

async function handleRealFire(deps: FireDeps, payload: TriggerTaskPayload, res: Response): Promise<void> {
  const claim = deps.claimAndRearm ?? claimAndRearmQuery;
  const scheduledFor = new Date(payload.targetEpoch * EPOCH_TO_MS);
  const next = nextRunFor(payload.schedule, scheduledFor, payload.triggerId, deps.jitterWindowMs);
  const { result: run } = await claim(deps.supabase, payload.triggerId, scheduledFor, next);
  if (run === null) {
    res.status(HTTP_OK).json({ ok: true, skipped: true });
    return;
  }
  if (next !== null) {
    await armToward(armDeps(deps), baseOf(payload), Math.floor(next.getTime() / EPOCH_TO_MS), new Date());
  }
  void runAndRecord(deps, payload, run.runId, run.sessionId);
  res.status(HTTP_ACCEPTED).json({ ok: true });
}

type FireHandler = (req: Request, res: Response) => Promise<void>;

export function createFireHandler(deps: FireDeps): FireHandler {
  return async function fire(req: Request, res: Response): Promise<void> {
    const payload = parsePayload(req.body);
    if (payload === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'invalid body' });
      return;
    }
    if (payload.hopEpoch !== payload.targetEpoch) {
      await handleContinuation(deps, payload, res);
      return;
    }
    await handleRealFire(deps, payload, res);
  };
}
