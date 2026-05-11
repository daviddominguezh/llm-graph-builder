import type { SupabaseClient } from '@supabase/supabase-js';

const ZERO_FILES = 0;
const ZERO_PAGES = 0;
const ZERO_BYTES = 0;

export interface TenantUsage {
  files_count: number;
  pages_count: number;
  bytes_total: number;
}

function hasNumberProp(value: object, key: string): boolean {
  if (!(key in value)) return false;
  const v: unknown = Reflect.get(value, key);
  return typeof v === 'number';
}

function isUsageRow(value: unknown): value is TenantUsage {
  if (typeof value !== 'object' || value === null) return false;
  return (
    hasNumberProp(value, 'files_count') &&
    hasNumberProp(value, 'pages_count') &&
    hasNumberProp(value, 'bytes_total')
  );
}

const ZERO_USAGE: TenantUsage = {
  files_count: ZERO_FILES,
  pages_count: ZERO_PAGES,
  bytes_total: ZERO_BYTES,
};

export async function getTenantUsage(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<{ result: TenantUsage; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_usage_by_tenant')
    .select('files_count, pages_count, bytes_total')
    .eq('rag_store_id', storeId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error !== null) return { result: ZERO_USAGE, error: error.message };
  if (data === null) return { result: ZERO_USAGE, error: null };
  if (!isUsageRow(data)) return { result: ZERO_USAGE, error: 'invalid usage row' };
  return { result: data, error: null };
}
