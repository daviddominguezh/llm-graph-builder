import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgEnvVariableRow {
  id: string;
  org_id: string;
  name: string;
  is_secret: boolean;
  created_at: string;
}

/**
 * Supabase returns untyped data for schemas without codegen.
 * This type predicate enables safe narrowing from query results.
 */
export function isOrgEnvVariableRow(value: unknown): value is OrgEnvVariableRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}

function mapRows(data: unknown[]): OrgEnvVariableRow[] {
  return data.reduce<OrgEnvVariableRow[]>((acc, row) => {
    if (isOrgEnvVariableRow(row)) acc.push(row);
    return acc;
  }, []);
}

const COLUMNS = 'id, org_id, name, is_secret, created_at';
const LIST_COLUMNS = 'id, org_id, name, is_secret, created_at';

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
  const { data, error } = await supabase.rpc('get_env_variable_value', { p_var_id: variableId });

  if (error !== null) return { value: null, error: error.message };
  return { value: (data as string) ?? null, error: null };
}

export async function createEnvVariable(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase.rpc('create_org_env_variable', {
    p_org_id: orgId,
    p_name: name,
    p_value: value,
    p_is_secret: isSecret,
    p_created_by: userId,
  });

  if (error !== null) return { result: null, error: error.message };
  const rows = data as unknown[];
  const first: unknown = rows[0];
  if (!isOrgEnvVariableRow(first)) return { result: null, error: 'Invalid env variable data' };
  return { result: first, error: null };
}

export async function updateEnvVariable(
  supabase: SupabaseClient,
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
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
