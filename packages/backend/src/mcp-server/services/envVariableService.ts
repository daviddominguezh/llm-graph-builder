import {
  type OrgEnvVariableRow,
  createEnvVariable as createEnvVariableQuery,
  deleteEnvVariable as deleteEnvVariableQuery,
  getEnvVariableValue as getEnvVariableValueQuery,
  getEnvVariablesByOrg,
  updateEnvVariable as updateEnvVariableQuery,
} from '../../db/queries/envVariableQueries.js';
import type { ServiceContext } from '../types.js';

export async function listEnvVariables(ctx: ServiceContext): Promise<OrgEnvVariableRow[]> {
  const { result, error } = await getEnvVariablesByOrg(ctx.supabase, ctx.orgId);
  if (error !== null) throw new Error(error);
  return result;
}

export async function createEnvVariable(
  ctx: ServiceContext,
  name: string,
  value: string,
  isSecret?: boolean
): Promise<OrgEnvVariableRow> {
  const { result, error } = await createEnvVariableQuery(ctx.supabase, {
    orgId: ctx.orgId,
    name,
    value,
    isSecret: isSecret ?? false,
    userId: '',
  });
  if (error !== null || result === null) throw new Error(error ?? 'Failed to create env variable');
  return result;
}

export async function updateEnvVariable(
  ctx: ServiceContext,
  variableId: string,
  fields: { name?: string; value?: string; isSecret?: boolean }
): Promise<void> {
  const { error } = await updateEnvVariableQuery(ctx.supabase, variableId, fields);
  if (error !== null) throw new Error(error);
}

export async function deleteEnvVariable(ctx: ServiceContext, variableId: string): Promise<void> {
  const { error } = await deleteEnvVariableQuery(ctx.supabase, variableId);
  if (error !== null) throw new Error(error);
}

export async function getEnvVariableValue(
  ctx: ServiceContext,
  variableId: string
): Promise<{ value: string | null }> {
  const { value, error } = await getEnvVariableValueQuery(ctx.supabase, variableId);
  if (error !== null) throw new Error(error);
  return { value };
}
