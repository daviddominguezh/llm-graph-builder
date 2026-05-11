import type { SupabaseClient } from '@supabase/supabase-js';

export interface KvEntryRow {
  key: string;
  value: string;
}

export interface KvEntryDbRow extends KvEntryRow {
  id: string;
  kv_store_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

function isKvEntryDbRow(value: unknown): value is KvEntryDbRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'key' in value && 'value' in value && 'kv_store_id' in value && 'tenant_id' in value;
}

export async function getKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string
): Promise<{ result: KvEntryRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value, kv_store_id, tenant_id, id, created_at, updated_at')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const mapped: KvEntryRow[] = rows.reduce<KvEntryRow[]>((acc, row) => {
    if (isKvEntryDbRow(row)) acc.push({ key: row.key, value: row.value });
    return acc;
  }, []);
  return { result: mapped, error: null };
}

function dedupe(items: KvEntryRow[]): KvEntryRow[] {
  const seen = new Set<string>();
  const out: KvEntryRow[] = [];
  for (const item of items) {
    if (item.key === '') continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({ key: item.key, value: item.value });
  }
  return out;
}

export async function replaceKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  items: KvEntryRow[]
): Promise<{ error: string | null }> {
  const cleaned = dedupe(items);
  const { error: deleteError } = await supabase
    .from('kv_entries')
    .delete()
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId);
  if (deleteError !== null) return { error: deleteError.message };
  if (cleaned.length === 0) return { error: null };
  const rows = cleaned.map((item) => ({
    kv_store_id: kvStoreId,
    tenant_id: tenantId,
    key: item.key,
    value: item.value,
  }));
  const { error: insertError } = await supabase.from('kv_entries').insert(rows);
  if (insertError !== null) return { error: insertError.message };
  return { error: null };
}
