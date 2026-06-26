import { fetchFromBackend } from './backendProxy';

export interface KvStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface KvEntry {
  key: string;
  value: string;
}

export function isKvStoreRow(value: unknown): value is KvStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

function isKvStoreRowArray(val: unknown): val is KvStoreRow[] {
  return Array.isArray(val);
}

function isKvEntry(value: unknown): value is KvEntry {
  if (typeof value !== 'object' || value === null) return false;
  if (!('key' in value) || !('value' in value)) return false;
  return typeof value.key === 'string' && typeof value.value === 'string';
}

function isKvEntryArray(val: unknown): val is KvEntry[] {
  return Array.isArray(val) && val.every(isKvEntry);
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function getKvStoresByOrg(
  orgId: string
): Promise<{ result: KvStoreRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/kv-stores/${encodeURIComponent(orgId)}`);
    if (!isKvStoreRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createKvStore(
  orgId: string,
  name: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/kv-stores', { orgId, name });
    if (!isKvStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateKvStore(
  storeId: string,
  name: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('PATCH', `/kv-stores/${encodeURIComponent(storeId)}`, { name });
    if (!isKvStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteKvStore(storeId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/kv-stores/${encodeURIComponent(storeId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function getKvEntries(
  storeId: string,
  tenantId: string
): Promise<{ result: KvEntry[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/kv-stores/${encodeURIComponent(storeId)}/entries/${encodeURIComponent(tenantId)}`
    );
    if (!isKvEntryArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function saveKvEntries(
  storeId: string,
  tenantId: string,
  entries: KvEntry[]
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'PUT',
      `/kv-stores/${encodeURIComponent(storeId)}/entries/${encodeURIComponent(tenantId)}`,
      entries
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
