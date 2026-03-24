'use server';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import {
  createEnvVariable as createEnvVariableLib,
  deleteEnvVariable as deleteEnvVariableLib,
  getEnvVariablesByOrg as getEnvVariablesByOrgLib,
  updateEnvVariable as updateEnvVariableLib,
} from '@/app/lib/orgEnvVariables';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function getEnvVariablesByOrgAction(
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  serverLog('[getEnvVariablesByOrgAction] orgId:', orgId);
  const res = await getEnvVariablesByOrgLib(orgId);
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
  const res = await createEnvVariableLib(orgId, name, value, isSecret);
  if (res.error === null) serverLog('[createEnvVariableAction] created variable:', res.result?.id);
  else serverError('[createEnvVariableAction] error:', res.error);
  return res;
}

export async function updateEnvVariableAction(
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  serverLog('[updateEnvVariableAction] variableId:', variableId);
  const res = await updateEnvVariableLib(variableId, updates);
  if (res.error !== null) serverError('[updateEnvVariableAction] error:', res.error);
  return res;
}

export async function deleteEnvVariableAction(variableId: string): Promise<{ error: string | null }> {
  serverLog('[deleteEnvVariableAction] variableId:', variableId);
  const res = await deleteEnvVariableLib(variableId);
  if (res.error !== null) serverError('[deleteEnvVariableAction] error:', res.error);
  return res;
}
