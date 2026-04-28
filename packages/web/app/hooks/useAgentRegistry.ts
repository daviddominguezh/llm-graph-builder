'use client';

import useSWR from 'swr';

import type { RegistryTool, ToolGroup } from '../lib/toolRegistryTypes';

export type RegistryState =
  | { kind: 'loading' }
  | { kind: 'loaded'; groups: ToolGroup[]; tools: RegistryTool[]; fetchedAt: number }
  | {
      kind: 'partial-failure';
      groups: ToolGroup[];
      tools: RegistryTool[];
      failedProviders: string[];
      fetchedAt: number;
    }
  | { kind: 'total-failure'; reason: string };

const DEDUPE_INTERVAL_MS = 300_000;

interface RegistryToolResponse {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface RegistryProviderError {
  reason: string;
  detail: string;
}

interface RegistryProviderResponse {
  type: 'builtin' | 'mcp';
  id: string;
  displayName: string;
  description?: string;
  tools: RegistryToolResponse[];
  error?: RegistryProviderError;
}

interface RegistryResponse {
  providers: RegistryProviderResponse[];
  fetchedAt?: number;
}

async function fetcher(url: string): Promise<RegistryResponse> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Registry request failed (${String(res.status)}): ${text}`);
  }
  const data = (await res.json()) as RegistryResponse;
  return data;
}

function builtinSourceId(provider: RegistryProviderResponse): string {
  return provider.type === 'builtin' ? `__${provider.id}__` : provider.id;
}

interface ShapedProvider {
  group: ToolGroup;
  tools: RegistryTool[];
}

function shapeProvider(provider: RegistryProviderResponse): ShapedProvider {
  const sourceId = builtinSourceId(provider);
  const tools: RegistryTool[] = provider.tools.map((tool) => ({
    sourceId,
    group: provider.displayName,
    name: tool.toolName,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  return { group: { groupName: provider.displayName, tools }, tools };
}

function buildState(data: RegistryResponse): RegistryState {
  const groups: ToolGroup[] = [];
  const tools: RegistryTool[] = [];
  const failed: string[] = [];
  for (const provider of data.providers) {
    const shaped = shapeProvider(provider);
    groups.push(shaped.group);
    tools.push(...shaped.tools);
    if (provider.error !== undefined) failed.push(provider.id);
  }
  const fetchedAt = data.fetchedAt ?? Date.now();
  if (failed.length > 0) {
    return { kind: 'partial-failure', groups, tools, failedProviders: failed, fetchedAt };
  }
  return { kind: 'loaded', groups, tools, fetchedAt };
}

function buildErrorState(error: unknown): RegistryState {
  const reason = error instanceof Error ? error.message : 'unknown';
  return { kind: 'total-failure', reason };
}

export function useAgentRegistry(agentId: string): RegistryState {
  const key = agentId.length > 0 ? `/api/agents/${encodeURIComponent(agentId)}/registry` : null;
  const { data, error, isLoading } = useSWR<RegistryResponse>(key, fetcher, {
    revalidateOnMount: true,
    dedupingInterval: DEDUPE_INTERVAL_MS,
  });
  if (key === null || isLoading) return { kind: 'loading' };
  if (error !== undefined) return buildErrorState(error);
  if (data === undefined) return { kind: 'loading' };
  return buildState(data);
}
