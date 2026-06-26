import type { TriggerFormState } from '@/app/components/agents/triggers/types';
import type { RecurringConfig, ScheduleMode } from '@openflow/shared-validation/triggers/schedule';
import { toTriggerSchedule } from '@openflow/shared-validation/triggers/schedule';

import { fetchFromBackend, proxyToBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// keep in sync with packages/backend/src/db/queries/triggerQueries.ts TriggerRow
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

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isTriggerRow(value: unknown): value is TriggerRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'agent_id' in value && 'mode' in value && 'enabled' in value;
}

function isTriggerRowArray(value: unknown): value is TriggerRow[] {
  return Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function listTriggers(
  agentId: string,
  tenantId: string
): Promise<{ result: TriggerRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/agents/${encodeURIComponent(agentId)}/triggers?tenantId=${encodeURIComponent(tenantId)}`
    );
    if (!isTriggerRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createTrigger(
  agentId: string,
  tenantId: string,
  form: TriggerFormState
): Promise<{ result: TriggerRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', `/agents/${encodeURIComponent(agentId)}/triggers`, {
      tenantId,
      schedule: toTriggerSchedule(form),
      initialMessage: form.initialMessage,
    });
    if (!isTriggerRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function setTriggerEnabled(
  agentId: string,
  triggerId: string,
  enabled: boolean
): Promise<{ result: TriggerRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'PATCH',
      `/agents/${encodeURIComponent(agentId)}/triggers/${encodeURIComponent(triggerId)}/enabled`,
      { enabled }
    );
    if (!isTriggerRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteTrigger(agentId: string, triggerId: string): Promise<{ error: string | null }> {
  try {
    // Backend replies 204 No Content; proxyToBackend lets us inspect status
    // without JSON-parsing an empty body (fetchFromBackend would throw on it).
    const res = await proxyToBackend(
      'DELETE',
      `/agents/${encodeURIComponent(agentId)}/triggers/${encodeURIComponent(triggerId)}`
    );
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { error: `Backend request failed (${String(res.status)}): ${text}` };
    }
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
