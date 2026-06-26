import type {
  RecurringConfig,
  ScheduleMode,
  TriggerSchedule,
} from '@openflow/shared-validation/triggers/schedule';

import type { SupabaseClient } from './operationHelpers.js';

// keep in sync with supabase migration agent_triggers + packages/web/app/lib/triggers.ts
export interface TriggerRow {
  id: string;
  agent_id: string;
  tenant_id: string;
  org_id: string;
  mode: ScheduleMode;
  recurring: RecurringConfig | null;
  once_datetime: string | null;
  initial_message: string;
  next_run_at: string | null;
  enabled: boolean;
  armed_task_epoch: number | null;
  run_count: number;
  last_status: string | null;
  last_run_at: string | null;
  created_at: string;
}

export type TriggerRunStatus = 'running' | 'succeeded' | 'failed';

const TRIGGER_COLUMNS =
  'id, agent_id, tenant_id, org_id, mode, recurring, once_datetime, initial_message, next_run_at, enabled, armed_task_epoch, run_count, last_status, last_run_at, created_at';

const MS_PER_SECOND = 1000;

/** Whole-second UTC ISO string for next_run_at (or null). */
export function mapNextRunAt(d: Date | null): string | null {
  if (d === null) return null;
  return new Date(Math.floor(d.getTime() / MS_PER_SECOND) * MS_PER_SECOND).toISOString();
}

function extractError(error: { message: string } | null): string | null {
  return error === null ? null : error.message;
}

function isTriggerRow(value: unknown): value is TriggerRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'agent_id' in value && 'mode' in value && 'enabled' in value;
}

function mapRows(data: unknown[]): TriggerRow[] {
  return data.reduce<TriggerRow[]>((acc, row) => {
    if (isTriggerRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function listTriggers(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<{ result: TriggerRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .select(TRIGGER_COLUMNS)
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { result: mapRows(rows), error: null };
}

export async function getTriggerById(
  supabase: SupabaseClient,
  triggerId: string
): Promise<{ result: TriggerRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .select(TRIGGER_COLUMNS)
    .eq('id', triggerId)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTriggerRow(data)) return { result: null, error: 'Invalid agent_trigger data' };
  return { result: data, error: null };
}

export interface InsertTriggerParams {
  /** App-generated UUID so jitter can be seeded before the (single) insert. When
   *  omitted, the DB column default generates one. */
  id?: string;
  agentId: string;
  tenantId: string;
  orgId: string;
  schedule: TriggerSchedule;
  initialMessage: string;
  nextRunAt: Date | null;
  armedTaskEpoch: number | null;
}

interface FlatSchedule {
  mode: ScheduleMode;
  recurring: RecurringConfig | null;
  once_datetime: string | null;
}

function flattenSchedule(schedule: TriggerSchedule): FlatSchedule {
  if (schedule.mode === 'recurring') {
    return { mode: 'recurring', recurring: schedule.recurring, once_datetime: null };
  }
  if (schedule.mode === 'once') {
    return { mode: 'once', recurring: null, once_datetime: schedule.onceDateTime };
  }
  return { mode: 'after-event', recurring: null, once_datetime: null };
}

function buildInsertRow(params: InsertTriggerParams): Record<string, unknown> {
  const flat = flattenSchedule(params.schedule);
  const row: Record<string, unknown> = {
    agent_id: params.agentId,
    tenant_id: params.tenantId,
    org_id: params.orgId,
    mode: flat.mode,
    recurring: flat.recurring,
    once_datetime: flat.once_datetime,
    initial_message: params.initialMessage,
    next_run_at: mapNextRunAt(params.nextRunAt),
    armed_task_epoch: params.armedTaskEpoch,
  };
  const { id } = params;
  if (id !== undefined) row.id = id;
  return row;
}

export async function insertTrigger(
  supabase: SupabaseClient,
  params: InsertTriggerParams
): Promise<{ result: TriggerRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .insert(buildInsertRow(params))
    .select(TRIGGER_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  if (!isTriggerRow(data)) return { result: null, error: 'Invalid agent_trigger data' };
  return { result: data, error: null };
}

export async function deleteTrigger(
  supabase: SupabaseClient,
  agentId: string,
  triggerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_triggers')
    .delete()
    .eq('id', triggerId)
    .eq('agent_id', agentId);
  return { error: extractError(error) };
}

export async function setTriggerEnabled(
  supabase: SupabaseClient,
  agentId: string,
  triggerId: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_triggers')
    .update({ enabled })
    .eq('id', triggerId)
    .eq('agent_id', agentId);
  return { error: extractError(error) };
}

export async function isTriggerEnabled(supabase: SupabaseClient, triggerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .select('enabled')
    .eq('id', triggerId)
    .maybeSingle();
  if (error !== null || data === null) return false;
  return (data as { enabled?: unknown }).enabled === true;
}

export async function setArmedTaskEpoch(
  supabase: SupabaseClient,
  triggerId: string,
  hopEpoch: number | null
): Promise<void> {
  await supabase.from('agent_triggers').update({ armed_task_epoch: hopEpoch }).eq('id', triggerId);
}

export async function setNextRunAt(
  supabase: SupabaseClient,
  triggerId: string,
  nextRunAt: Date | null
): Promise<void> {
  await supabase
    .from('agent_triggers')
    .update({ next_run_at: mapNextRunAt(nextRunAt) })
    .eq('id', triggerId);
}

interface ClaimRow {
  run_id: string;
  session_id: string;
}

const FIRST_ROW = 0;

function isClaimRow(value: unknown): value is ClaimRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as { run_id?: unknown; session_id?: unknown };
  return typeof row.run_id === 'string' && typeof row.session_id === 'string';
}

function firstRpcRow(data: unknown): unknown {
  return Array.isArray(data) ? data[FIRST_ROW] : null;
}

export async function claimAndRearm(
  supabase: SupabaseClient,
  triggerId: string,
  scheduledFor: Date,
  nextRunAt: Date | null
): Promise<{ result: { runId: string; sessionId: string } | null; error: string | null }> {
  const rpcResult = await supabase.rpc('claim_and_rearm', {
    p_trigger_id: triggerId,
    p_scheduled_for: scheduledFor.toISOString(),
    p_next_run_at: mapNextRunAt(nextRunAt),
  });
  if (rpcResult.error !== null) return { result: null, error: rpcResult.error.message };
  const row = firstRpcRow(rpcResult.data);
  if (!isClaimRow(row)) return { result: null, error: null }; // duplicate delivery / disabled
  return { result: { runId: row.run_id, sessionId: row.session_id }, error: null };
}

export interface RecordOutcomeParams {
  runId: string;
  status: TriggerRunStatus;
  failureReason?: string;
  error?: string;
}

export async function recordOutcome(
  supabase: SupabaseClient,
  outcome: RecordOutcomeParams
): Promise<{ error: string | null }> {
  const runUpdate = await supabase
    .from('trigger_runs')
    .update({
      status: outcome.status,
      failure_reason: outcome.failureReason ?? null,
      error: outcome.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', outcome.runId)
    .select('trigger_id')
    .maybeSingle();
  if (runUpdate.error !== null) return { error: runUpdate.error.message };
  const triggerId = (runUpdate.data as { trigger_id?: unknown } | null)?.trigger_id;
  if (typeof triggerId !== 'string') return { error: null };
  const triggerUpdate = await supabase
    .from('agent_triggers')
    .update({ last_status: outcome.status })
    .eq('id', triggerId);
  return { error: extractError(triggerUpdate.error) };
}
