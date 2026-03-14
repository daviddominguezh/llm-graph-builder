import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgEnvVariableRow {
  id: string;
  org_id: string;
  name: string;
  value: string;
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

const COLUMNS = 'id, org_id, name, value, is_secret, created_at';
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
  const { data, error } = await supabase
    .from('org_env_variables')
    .select('value')
    .eq('id', variableId)
    .single();

  if (error !== null) return { value: null, error: error.message };
  const row = data as { value: string } | null;
  return { value: row?.value ?? null, error: null };
}

export async function createEnvVariable(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const result = await supabase
    .from('org_env_variables')
    .insert({ org_id: orgId, name, value, is_secret: isSecret, created_by: userId })
    .select(COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isOrgEnvVariableRow(result.data)) return { result: null, error: 'Invalid env variable data' };
  return { result: result.data, error: null };
}

export async function updateEnvVariable(
  supabase: SupabaseClient,
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch['name'] = updates.name;
  if (updates.value !== undefined) patch['value'] = updates.value;
  if (updates.isSecret !== undefined) patch['is_secret'] = updates.isSecret;

  const { error } = await supabase.from('org_env_variables').update(patch).eq('id', variableId);

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
