import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OrgEnvVariableRow {
  id: string;
  org_id: string;
  name: string;
  is_secret: boolean;
  created_at: string;
}

export interface EnvVariableUpdates {
  name?: string;
  value?: string;
  isSecret?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isOrgEnvVariableRow(value: unknown): value is OrgEnvVariableRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}

function isUnknownArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapRows(data: unknown[]): OrgEnvVariableRow[] {
  return data.reduce<OrgEnvVariableRow[]>((acc, row) => {
    if (isOrgEnvVariableRow(row)) acc.push(row);
    return acc;
  }, []);
}

const LIST_COLUMNS = 'id, org_id, name, is_secret, created_at';

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getEnvVariablesByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('org_env_variables')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getEnvVariableValue(
  supabase: SupabaseClient,
  variableId: string
): Promise<{ value: string | null; error: string | null }> {
  const result = await supabase.rpc('get_env_variable_value', { p_var_id: variableId });

  if (result.error !== null) return { value: null, error: result.error.message };
  const rawData: unknown = result.data;
  const value = typeof rawData === 'string' ? rawData : null;
  return { value, error: null };
}

export interface CreateEnvVariableInput {
  orgId: string;
  name: string;
  value: string;
  isSecret: boolean;
  userId: string;
}

export async function createEnvVariable(
  supabase: SupabaseClient,
  input: CreateEnvVariableInput
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  const result = await supabase.rpc('create_org_env_variable', {
    p_org_id: input.orgId,
    p_name: input.name,
    p_value: input.value,
    p_is_secret: input.isSecret,
    p_created_by: input.userId,
  });

  if (result.error !== null) return { result: null, error: result.error.message };
  const rawData: unknown = result.data;
  if (!isUnknownArray(rawData)) return { result: null, error: 'Invalid env variable data' };
  const [first] = rawData;
  if (!isOrgEnvVariableRow(first)) return { result: null, error: 'Invalid env variable data' };
  return { result: first, error: null };
}

export async function updateEnvVariable(
  supabase: SupabaseClient,
  variableId: string,
  updates: EnvVariableUpdates
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_org_env_variable', {
    p_var_id: variableId,
    p_name: updates.name ?? null,
    p_value: updates.value ?? null,
    p_is_secret: updates.isSecret ?? null,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteEnvVariable(
  supabase: SupabaseClient,
  variableId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('org_env_variables').delete().eq('id', variableId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
