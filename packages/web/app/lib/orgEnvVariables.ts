import { fetchFromBackend } from './backendProxy';

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

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isOrgEnvVariableRow(value: unknown): value is OrgEnvVariableRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}

function isOrgEnvVariableRowArray(val: unknown): val is OrgEnvVariableRow[] {
  return Array.isArray(val);
}

interface EnvVariableValueResponse {
  value: string | null;
}

function isEnvVariableValueResponse(val: unknown): val is EnvVariableValueResponse {
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

export async function getEnvVariablesByOrg(
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/env-vars/${encodeURIComponent(orgId)}`);
    if (!isOrgEnvVariableRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function getEnvVariableValue(
  variableId: string
): Promise<{ value: string | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/env-vars/${encodeURIComponent(variableId)}/value`);
    if (!isEnvVariableValueResponse(data)) return { value: null, error: 'Invalid response' };
    return { value: data.value, error: null };
  } catch (err) {
    return { value: null, error: extractError(err) };
  }
}

export async function createEnvVariable(
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/secrets/env-vars', { orgId, name, value, isSecret });
    if (!isOrgEnvVariableRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateEnvVariable(
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', `/secrets/env-vars/${encodeURIComponent(variableId)}`, updates);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function deleteEnvVariable(variableId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/secrets/env-vars/${encodeURIComponent(variableId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
