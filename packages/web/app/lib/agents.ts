import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { cache } from 'react';

import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  start_node: string;
  current_version: number;
  version: number;
  created_at: string;
  updated_at: string;
  staging_api_key_id: string | null;
  production_api_key_id: string | null;
  is_public: boolean;
  category: string;
  created_from_template_id: string | null;
  app_type: string;
  system_prompt: string | null;
  max_steps: number | null;
  selected_tools: SelectedTool[];
}

export type AgentMetadata = Pick<
  AgentRow,
  'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'
> & {
  published_at: string | null;
  app_type?: string;
};

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isAgentRow(value: unknown): value is AgentRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'slug' in value &&
    'selected_tools' in value
  );
}

function isAgentMetadataArray(value: unknown): value is AgentMetadata[] {
  return Array.isArray(value);
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

export async function getAgentsByOrg(
  orgId: string
): Promise<{ agents: AgentMetadata[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/agents/by-org/${encodeURIComponent(orgId)}`);
    if (!isAgentMetadataArray(data)) return { agents: [], error: 'Invalid response' };
    return { agents: data, error: null };
  } catch (err) {
    return { agents: [], error: extractError(err) };
  }
}

export const getCachedAgentsByOrg = cache(getAgentsByOrg);

export async function getAgentBySlug(
  slug: string
): Promise<{ agent: AgentRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/agents/by-slug/${encodeURIComponent(slug)}`);
    if (!isAgentRow(data)) return { agent: null, error: 'Invalid response' };
    return { agent: data, error: null };
  } catch (err) {
    return { agent: null, error: extractError(err) };
  }
}

export interface CreateAgentParams {
  orgId: string;
  name: string;
  description: string;
  category: string;
  isPublic: boolean;
  templateAgentId?: string;
  templateVersion?: number;
  appType?: string;
}

export async function createAgent(
  params: CreateAgentParams
): Promise<{ agent: AgentRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/agents', params);
    if (!isAgentRow(data)) return { agent: null, error: 'Invalid response' };
    return { agent: data, error: null };
  } catch (err) {
    return { agent: null, error: extractError(err) };
  }
}

export async function saveStagingKeyId(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', `/agents/${encodeURIComponent(agentId)}/staging-key`, { keyId });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function saveProductionKeyId(
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('PATCH', `/agents/${encodeURIComponent(agentId)}/production-key`, {
      keyId,
    });
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function deleteAgent(agentId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/agents/${encodeURIComponent(agentId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
