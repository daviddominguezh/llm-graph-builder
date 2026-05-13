import { fetchFromBackend } from './backendProxy';

export interface RagStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isRagStoreRow(value: unknown): value is RagStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

function isRagStoreRowArray(val: unknown): val is RagStoreRow[] {
  return Array.isArray(val);
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function getRagStoresByOrg(
  orgId: string
): Promise<{ result: RagStoreRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/rag-stores/${encodeURIComponent(orgId)}`);
    if (!isRagStoreRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createRagStore(
  orgId: string,
  name: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/rag-stores', { orgId, name });
    if (!isRagStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateRagStore(
  storeId: string,
  name: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('PATCH', `/rag-stores/${encodeURIComponent(storeId)}`, { name });
    if (!isRagStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteRagStore(storeId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/rag-stores/${encodeURIComponent(storeId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
