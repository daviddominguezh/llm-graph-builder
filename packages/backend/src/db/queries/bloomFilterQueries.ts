import type { SupabaseClient } from './operationHelpers.js';

type SlugTable = 'agents' | 'organizations';

const FIRST_INDEX = 0;

interface BloomCheckResult {
  might_exist: boolean;
}

function isBloomCheckResult(value: unknown): value is BloomCheckResult {
  return typeof value === 'object' && value !== null && 'might_exist' in value;
}

export async function checkBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<boolean> {
  const { data, error } = (await supabase.rpc('check_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  })) as { data: unknown; error: { message: string } | null };

  if (error !== null) throw new Error(error.message);

  const row: unknown = Array.isArray(data) ? data[FIRST_INDEX] : data;
  if (!isBloomCheckResult(row)) return true;
  return row.might_exist;
}

export async function updateBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<void> {
  const { error } = (await supabase.rpc('update_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  })) as { error: { message: string } | null };

  if (error !== null) throw new Error(error.message);
}
