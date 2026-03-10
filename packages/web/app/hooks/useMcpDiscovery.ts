import { useEffect, useMemo, useRef, useState } from 'react';

import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
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

function getEnabledServers(servers: McpServerConfig[] | undefined): McpServerConfig[] {
  if (servers === undefined) return [];
  return servers.filter((s) => s.enabled);
}

async function discoverSingleServer(
  server: McpServerConfig
): Promise<{ id: string; tools: DiscoveredTool[] }> {
  const tools = await discoverMcpTools(server.transport);
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

export function useMcpDiscovery(servers: McpServerConfig[] | undefined): McpDiscoveryResult {
  const enabled = useMemo(() => getEnabledServers(servers), [servers]);
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
      void discoverSingleServer(server)
        .then((result) => {
          setTools((prev) => ({ ...prev, [result.id]: result.tools }));
          setSettled((prev) => ({ ...prev, [server.id]: 'done' }));
        })
        .catch(() => {
          setSettled((prev) => ({ ...prev, [server.id]: 'error' }));
        });
    }
  }, [servers, enabled]);

  return { loading, serverProgress, discoveredTools: tools };
}
