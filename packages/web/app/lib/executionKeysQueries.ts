import { fetchFromBackend } from './backendProxy';
import type { ExecutionKeyAgent, ExecutionKeyRow, ExecutionKeyWithAgents } from './executionKeys';
import { isExecutionKeyRow, mapExecutionKeyAgents, mapExecutionKeyRows } from './executionKeys';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CreateExecutionKeyResult {
  key: ExecutionKeyRow;
  fullKey: string;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isCreateKeyResult(val: unknown): val is CreateExecutionKeyResult {
  return typeof val === 'object' && val !== null && 'key' in val && 'fullKey' in val;
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

export async function getExecutionKeysByOrg(
  orgId: string
): Promise<{ result: ExecutionKeyRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/execution-keys/${encodeURIComponent(orgId)}`);
    if (!Array.isArray(data)) return { result: [], error: 'Invalid response' };
    return { result: mapExecutionKeyRows(data), error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function getAgentsForKey(
  keyId: string
): Promise<{ result: ExecutionKeyAgent[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/secrets/execution-keys/${encodeURIComponent(keyId)}/agents`);
    if (!Array.isArray(data)) return { result: [], error: 'Invalid response' };
    return { result: mapExecutionKeyAgents(data), error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

function extractAgents(row: object): ExecutionKeyAgent[] {
  if (!('agents' in row)) return [];
  const { agents } = row;
  return Array.isArray(agents) ? mapExecutionKeyAgents(agents) : [];
}

function toKeyWithAgents(row: unknown): ExecutionKeyWithAgents | null {
  if (!isExecutionKeyRow(row)) return null;
  return { ...row, agents: extractAgents(row) };
}

export async function getExecutionKeysWithAgentsByOrg(
  orgId: string
): Promise<{ result: ExecutionKeyWithAgents[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/secrets/execution-keys/${encodeURIComponent(orgId)}/with-agents`
    );
    if (!Array.isArray(data)) return { result: [], error: 'Invalid response' };
    const mapped: ExecutionKeyWithAgents[] = [];
    for (const row of data) {
      const key = toKeyWithAgents(row);
      if (key !== null) mapped.push(key);
    }
    return { result: mapped, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createExecutionKey(
  orgId: string,
  name: string,
  allAgents: boolean,
  agentIds: string[],
  expiresAt: string | null
): Promise<{ result: CreateExecutionKeyResult | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/secrets/execution-keys', {
      orgId,
      name,
      allAgents,
      agentIds,
      expiresAt,
    });
    if (!isCreateKeyResult(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function updateExecutionKeyAgents(
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', `/secrets/execution-keys/${encodeURIComponent(keyId)}`, {
      agentIds,
    });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function updateExecutionKeyName(keyId: string, name: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', `/secrets/execution-keys/${encodeURIComponent(keyId)}`, { name });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function deleteExecutionKey(keyId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/secrets/execution-keys/${encodeURIComponent(keyId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
