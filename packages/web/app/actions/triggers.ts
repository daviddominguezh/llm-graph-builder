'use server';

import type { TriggerFormState } from '@/app/components/agents/triggers/types';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import type { TriggerRow } from '@/app/lib/triggers';
import {
  createTrigger as createTriggerLib,
  deleteTrigger as deleteTriggerLib,
  listTriggers as listTriggersLib,
  setTriggerEnabled as setTriggerEnabledLib,
} from '@/app/lib/triggers';

export async function listTriggersAction(
  agentId: string,
  tenantId: string
): Promise<{ result: TriggerRow[]; error: string | null }> {
  serverLog('[listTriggersAction] agentId:', agentId, 'tenantId:', tenantId);
  const res = await listTriggersLib(agentId, tenantId);
  if (res.error === null) serverLog('[listTriggersAction] found', res.result.length, 'triggers');
  else serverError('[listTriggersAction] error:', res.error);
  return res;
}

export async function createTriggerAction(
  agentId: string,
  tenantId: string,
  form: TriggerFormState
): Promise<{ result: TriggerRow | null; error: string | null }> {
  serverLog('[createTriggerAction] agentId:', agentId, 'tenantId:', tenantId, 'mode:', form.mode);
  const res = await createTriggerLib(agentId, tenantId, form);
  if (res.error === null) serverLog('[createTriggerAction] created trigger:', res.result?.id);
  else serverError('[createTriggerAction] error:', res.error);
  return res;
}

export async function setTriggerEnabledAction(
  agentId: string,
  triggerId: string,
  enabled: boolean
): Promise<{ result: TriggerRow | null; error: string | null }> {
  serverLog('[setTriggerEnabledAction] triggerId:', triggerId, 'enabled:', enabled);
  const res = await setTriggerEnabledLib(agentId, triggerId, enabled);
  if (res.error === null) serverLog('[setTriggerEnabledAction] updated trigger:', res.result?.id);
  else serverError('[setTriggerEnabledAction] error:', res.error);
  return res;
}

export async function deleteTriggerAction(
  agentId: string,
  triggerId: string
): Promise<{ error: string | null }> {
  serverLog('[deleteTriggerAction] agentId:', agentId, 'triggerId:', triggerId);
  const res = await deleteTriggerLib(agentId, triggerId);
  if (res.error !== null) serverError('[deleteTriggerAction] error:', res.error);
  return res;
}
