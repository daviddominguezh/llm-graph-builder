import { createClient } from '@supabase/supabase-js';

import type { SupabaseClient } from './operationHelpers.js';

type ServiceClient = ReturnType<typeof createClient>;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function getRequiredEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createServiceClient(): ServiceClient {
  const url = getRequiredEnv('SUPABASE_URL');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

interface ExecutionKeyRow {
  id: string;
  org_id: string;
  expires_at: string | null;
}

interface ValidatedKey {
  id: string;
  orgId: string;
}

function isExpired(expiresAt: string | null): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt) < new Date();
}

export async function validateExecutionKey(
  supabase: SupabaseClient,
  keyHash: string
): Promise<ValidatedKey | null> {
  const result: QueryResult<ExecutionKeyRow> = await supabase
    .from('agent_execution_keys')
    .select('id, org_id, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (result.error !== null || result.data === null) return null;
  if (isExpired(result.data.expires_at)) return null;

  return { id: result.data.id, orgId: result.data.org_id };
}

export async function validateKeyAgentAccess(
  supabase: SupabaseClient,
  keyId: string,
  agentId: string
): Promise<boolean> {
  const result = await supabase
    .from('agent_execution_key_agents')
    .select('key_id')
    .eq('key_id', keyId)
    .eq('agent_id', agentId)
    .single();

  return result.error === null;
}

interface AgentLookupRow {
  id: string;
  production_api_key_id: string | null;
  start_node: string | null;
}

interface AgentLookupResult {
  id: string;
  productionApiKeyId: string | null;
  startNode: string | null;
}

function toAgentLookupResult(row: AgentLookupRow): AgentLookupResult {
  return {
    id: row.id,
    productionApiKeyId: row.production_api_key_id,
    startNode: row.start_node,
  };
}

export async function getAgentBySlugAndOrg(
  supabase: SupabaseClient,
  slug: string,
  orgId: string
): Promise<AgentLookupResult | null> {
  const result: QueryResult<AgentLookupRow> = await supabase
    .from('agents')
    .select('id, production_api_key_id, start_node')
    .eq('slug', slug)
    .eq('org_id', orgId)
    .single();

  if (result.error !== null || result.data === null) return null;
  return toAgentLookupResult(result.data);
}

export async function getPublishedGraphData(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<Record<string, unknown> | null> {
  const result: QueryResult<{ graph_data: Record<string, unknown> }> = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  if (result.error !== null || result.data === null) return null;
  return result.data.graph_data;
}

export async function getDecryptedApiKeyValue(
  supabase: SupabaseClient,
  keyId: string
): Promise<string | null> {
  const result = await supabase.rpc('get_api_key_value', { p_key_id: keyId });

  if (result.error !== null) return null;
  return typeof result.data === 'string' ? result.data : null;
}

interface EnvVariableRow {
  id: string;
  name: string;
}

async function fetchEnvVariableNames(supabase: SupabaseClient, orgId: string): Promise<EnvVariableRow[]> {
  const result: QueryResult<EnvVariableRow[]> = await supabase
    .from('org_env_variables')
    .select('id, name')
    .eq('org_id', orgId);

  if (result.error !== null) {
    throw new Error(`fetchEnvVariableNames: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function decryptEnvVariable(supabase: SupabaseClient, variableId: string): Promise<string | null> {
  const result = await supabase.rpc('get_env_variable_value', { p_variable_id: variableId });
  if (result.error !== null) return null;
  return typeof result.data === 'string' ? result.data : null;
}

export async function getDecryptedEnvVariables(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, string>> {
  const rows = await fetchEnvVariableNames(supabase, orgId);
  const entries: Array<[string, string]> = [];

  const decrypted = await Promise.all(
    rows.map(async (row) => {
      const value = await decryptEnvVariable(supabase, row.id);
      return { name: row.name, value };
    })
  );

  for (const item of decrypted) {
    if (item.value !== null) {
      entries.push([item.name, item.value]);
    }
  }

  return Object.fromEntries(entries);
}

export async function updateKeyLastUsed(supabase: SupabaseClient, keyId: string): Promise<void> {
  await supabase
    .from('agent_execution_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId);
}
