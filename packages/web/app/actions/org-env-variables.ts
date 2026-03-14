'use server';

import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import {
  createEnvVariable as createEnvVariableLib,
  deleteEnvVariable as deleteEnvVariableLib,
  getEnvVariablesByOrg as getEnvVariablesByOrgLib,
  updateEnvVariable as updateEnvVariableLib,
} from '@/app/lib/org-env-variables';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function getEnvVariablesByOrgAction(
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  serverLog('[getEnvVariablesByOrgAction] orgId:', orgId);
  const supabase = await createClient();
  const res = await getEnvVariablesByOrgLib(supabase, orgId);
  if (res.error === null) serverLog('[getEnvVariablesByOrgAction] found', res.result.length, 'variables');
  else serverError('[getEnvVariablesByOrgAction] error:', res.error);
  return res;
}

export async function createEnvVariableAction(
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  serverLog('[createEnvVariableAction] orgId:', orgId, 'name:', name);
  const supabase = await createClient();
  const res = await createEnvVariableLib(supabase, orgId, name, value, isSecret);
  if (res.error === null) serverLog('[createEnvVariableAction] created variable:', res.result?.id);
  else serverError('[createEnvVariableAction] error:', res.error);
  return res;
}

export async function updateEnvVariableAction(
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  serverLog('[updateEnvVariableAction] variableId:', variableId);
  const supabase = await createClient();
  const res = await updateEnvVariableLib(supabase, variableId, updates);
  if (res.error !== null) serverError('[updateEnvVariableAction] error:', res.error);
  return res;
}

export async function deleteEnvVariableAction(variableId: string): Promise<{ error: string | null }> {
  serverLog('[deleteEnvVariableAction] variableId:', variableId);
  const supabase = await createClient();
  const res = await deleteEnvVariableLib(supabase, variableId);
  if (res.error !== null) serverError('[deleteEnvVariableAction] error:', res.error);
  return res;
}
