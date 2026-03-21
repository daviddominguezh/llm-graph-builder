import type { SupabaseClient } from '@supabase/supabase-js';

export interface ApiKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_preview: string;
  created_at: string;
}

/**
 * Supabase returns untyped data for schemas without codegen.
 * This type predicate enables safe narrowing from query results.
 */
export function isApiKeyRow(value: unknown): value is ApiKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_preview' in value;
}

function mapApiKeyRows(data: unknown[]): ApiKeyRow[] {
  return data.reduce<ApiKeyRow[]>((acc, row) => {
    if (isApiKeyRow(row)) acc.push(row);
    return acc;
  }, []);
}

const API_KEY_COLUMNS = 'id, org_id, name, key_preview, created_at';

export async function getApiKeysByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('org_api_keys')
    .select(API_KEY_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapApiKeyRows(rows), error: null };
}

export async function getApiKeyValueById(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_api_key_value', { p_key_id: keyId });

  if (error !== null) return { value: null, error: error.message };
  return { value: (data as string) ?? null, error: null };
}

export async function createApiKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_org_api_key', {
    p_org_id: orgId,
    p_name: name,
    p_key_value: keyValue,
  });

  if (error !== null) return { result: null, error: error.message };
  const rows = data as unknown[];
  const first: unknown = rows[0];
  if (!isApiKeyRow(first)) return { result: null, error: 'Invalid API key data' };
  return { result: first, error: null };
}

export async function deleteApiKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('org_api_keys').delete().eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
