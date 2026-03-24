import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ApiKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_preview: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isApiKeyRow(value: unknown): value is ApiKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_preview' in value;
}

function isApiKeyRowArray(val: unknown): val is ApiKeyRow[] {
  return Array.isArray(val);
}

interface ApiKeyValueResponse {
  value: string | null;
}

function isApiKeyValueResponse(val: unknown): val is ApiKeyValueResponse {
  return typeof val === 'object' && val !== null && 'value' in val;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ------------------------------------------------------------------ */
/*  Queries via backend proxy                                          */
/* ------------------------------------------------------------------ */

export async function getApiKeysByOrg(orgId: string): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/api-keys/${encodeURIComponent(orgId)}`);
    if (!isApiKeyRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function getApiKeyValueById(
  keyId: string
): Promise<{ value: string | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/api-keys/${encodeURIComponent(keyId)}/value`);
    if (!isApiKeyValueResponse(data)) return { value: null, error: 'Invalid response' };
    return { value: data.value, error: null };
  } catch (err) {
    return { value: null, error: extractError(err) };
  }
}

export async function createApiKey(
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/secrets/api-keys', { orgId, name, keyValue });
    if (!isApiKeyRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteApiKey(keyId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/secrets/api-keys/${encodeURIComponent(keyId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
