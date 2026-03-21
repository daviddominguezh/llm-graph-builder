'use server';

import type { CreateExecutionKeyResult, ExecutionKeyAgent, ExecutionKeyRow } from '@/app/lib/execution-keys';
import {
  createExecutionKey as createExecutionKeyLib,
  deleteExecutionKey as deleteExecutionKeyLib,
  getAgentsForKey as getAgentsForKeyLib,
  getExecutionKeysByOrg as getExecutionKeysByOrgLib,
  updateExecutionKeyAgents as updateExecutionKeyAgentsLib,
  updateExecutionKeyName as updateExecutionKeyNameLib,
} from '@/app/lib/execution-keys';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function getExecutionKeysByOrgAction(
  orgId: string
): Promise<{ result: ExecutionKeyRow[]; error: string | null }> {
  serverLog('[getExecutionKeysByOrgAction] orgId:', orgId);
  const supabase = await createClient();
  const res = await getExecutionKeysByOrgLib(supabase, orgId);
  if (res.error === null) serverLog('[getExecutionKeysByOrgAction] found', res.result.length, 'keys');
  else serverError('[getExecutionKeysByOrgAction] error:', res.error);
  return res;
}

export async function getAgentsForKeyAction(
  keyId: string
): Promise<{ result: ExecutionKeyAgent[]; error: string | null }> {
  serverLog('[getAgentsForKeyAction] keyId:', keyId);
  const supabase = await createClient();
  const res = await getAgentsForKeyLib(supabase, keyId);
  if (res.error === null) serverLog('[getAgentsForKeyAction] found', res.result.length, 'agents');
  else serverError('[getAgentsForKeyAction] error:', res.error);
  return res;
}

export async function createExecutionKeyAction(
  orgId: string,
  name: string,
  agentIds: string[],
  expiresAt: string | null
): Promise<{ result: CreateExecutionKeyResult | null; error: string | null }> {
  serverLog('[createExecutionKeyAction] orgId:', orgId, 'name:', name);
  const supabase = await createClient();
  const res = await createExecutionKeyLib(supabase, orgId, name, agentIds, expiresAt);
  if (res.error === null) serverLog('[createExecutionKeyAction] created key:', res.result?.key.id);
  else serverError('[createExecutionKeyAction] error:', res.error);
  return res;
}

export async function updateExecutionKeyAgentsAction(
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  serverLog('[updateExecutionKeyAgentsAction] keyId:', keyId, 'agentIds:', agentIds);
  const supabase = await createClient();
  const res = await updateExecutionKeyAgentsLib(supabase, keyId, agentIds);
  if (res.error !== null) serverError('[updateExecutionKeyAgentsAction] error:', res.error);
  return res;
}

export async function updateExecutionKeyNameAction(
  keyId: string,
  name: string
): Promise<{ error: string | null }> {
  serverLog('[updateExecutionKeyNameAction] keyId:', keyId, 'name:', name);
  const supabase = await createClient();
  const res = await updateExecutionKeyNameLib(supabase, keyId, name);
  if (res.error !== null) serverError('[updateExecutionKeyNameAction] error:', res.error);
  return res;
}

export async function deleteExecutionKeyAction(keyId: string): Promise<{ error: string | null }> {
  serverLog('[deleteExecutionKeyAction] keyId:', keyId);
  const supabase = await createClient();
  const res = await deleteExecutionKeyLib(supabase, keyId);
  if (res.error !== null) serverError('[deleteExecutionKeyAction] error:', res.error);
  return res;
}
