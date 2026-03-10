import { useEffect, useRef, useState } from 'react';

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

function buildInitialProgress(servers: McpServerConfig[]): ServerProgress[] {
  return servers.map((s) => ({ id: s.id, name: s.name, status: 'loading' as const }));
}

function updateProgressEntry(
  prev: ServerProgress[],
  id: string,
  status: 'done' | 'error'
): ServerProgress[] {
  return prev.map((p) => (p.id === id ? { ...p, status } : p));
}

export function useMcpDiscovery(servers: McpServerConfig[] | undefined): McpDiscoveryResult {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ServerProgress[]>([]);
  const [tools, setTools] = useState<Record<string, DiscoveredTool[]>>({});
  const started = useRef(false);

  useEffect(() => {
    if (servers === undefined) {
      started.current = false;
      return;
    }
    if (started.current) return;

    const enabled = getEnabledServers(servers);
    if (enabled.length === 0) return;

    started.current = true;
    setLoading(true);
    setProgress(buildInitialProgress(enabled));

    const promises = enabled.map((server) =>
      discoverSingleServer(server)
        .then((result) => {
          setTools((prev) => ({ ...prev, [result.id]: result.tools }));
          setProgress((prev) => updateProgressEntry(prev, server.id, 'done'));
        })
        .catch(() => {
          setProgress((prev) => updateProgressEntry(prev, server.id, 'error'));
        })
    );

    void Promise.allSettled(promises).then(() => {
      setLoading(false);
    });
  }, [servers]);

  return { loading, serverProgress: progress, discoveredTools: tools };
}
