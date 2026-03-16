import { useEffect, useMemo, useRef, useState } from 'react';

import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
import type { McpLibraryRow } from '../lib/mcp-library-types';
import type { McpServerConfig } from '../schemas/graph.schema';

export interface McpDiscoveryResult {
  loading: boolean;
  serverProgress: ServerProgress[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

export interface ServerProgress {
  id: string;
  name: string;
  status: 'loading' | 'done' | 'error';
}

type SettledStatus = 'done' | 'error';

function hasCompleteVariables(server: McpServerConfig): boolean {
  if (server.variableValues === undefined) return true;
  return Object.values(server.variableValues).every((v) =>
    v.type === 'direct' ? (v.value ?? '') !== '' : (v.envVariableId ?? '') !== ''
  );
}

function isOAuthServer(server: McpServerConfig, libraryItems: McpLibraryRow[]): boolean {
  if (server.libraryItemId === undefined) return false;
  const item = libraryItems.find((i) => i.id === server.libraryItemId);
  return item?.auth_type === 'oauth';
}

function getDiscoverableServers(
  servers: McpServerConfig[] | undefined,
  libraryItems: McpLibraryRow[]
): McpServerConfig[] {
  if (servers === undefined) return [];
  return servers.filter((s) => {
    if (!s.enabled) return false;
    if (isOAuthServer(s, libraryItems)) return true;
    return hasCompleteVariables(s);
  });
}

async function discoverSingleServer(
  server: McpServerConfig,
  orgId?: string
): Promise<{ id: string; tools: DiscoveredTool[] }> {
  const tools = await discoverMcpTools(server.transport, {
    variableValues: server.variableValues as Record<string, unknown> | undefined,
    orgId,
    libraryItemId: server.libraryItemId,
  });
  return { id: server.id, tools };
}

function buildProgress(enabled: McpServerConfig[], settled: Record<string, SettledStatus>): ServerProgress[] {
  return enabled.map((s) => ({
    id: s.id,
    name: s.name,
    status: settled[s.id] ?? ('loading' as const),
  }));
}

const EMPTY_LENGTH = 0;

export function useMcpDiscovery(
  servers: McpServerConfig[] | undefined,
  libraryItems?: McpLibraryRow[],
  orgId?: string
): McpDiscoveryResult {
  const enabled = useMemo(() => getDiscoverableServers(servers, libraryItems ?? []), [servers, libraryItems]);
  const [settled, setSettled] = useState<Record<string, SettledStatus>>({});
  const [tools, setTools] = useState<Record<string, DiscoveredTool[]>>({});
  const started = useRef(false);

  const serverProgress = useMemo(() => buildProgress(enabled, settled), [enabled, settled]);
  const loading = enabled.length > EMPTY_LENGTH && serverProgress.some((p) => p.status === 'loading');

  useEffect(() => {
    if (servers === undefined) {
      started.current = false;
      return;
    }
    if (started.current || enabled.length === EMPTY_LENGTH) return;
    started.current = true;

    for (const server of enabled) {
      void discoverSingleServer(server, orgId)
        .then((result) => {
          setTools((prev) => ({ ...prev, [result.id]: result.tools }));
          setSettled((prev) => ({ ...prev, [server.id]: 'done' }));
        })
        .catch(() => {
          setSettled((prev) => ({ ...prev, [server.id]: 'error' }));
        });
    }
  }, [servers, enabled, orgId]);

  return { loading, serverProgress, discoveredTools: tools };
}
