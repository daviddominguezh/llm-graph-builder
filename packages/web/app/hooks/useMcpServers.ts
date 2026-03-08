import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
import type { McpServerConfig } from '../schemas/graph.schema';

export interface McpServersState {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  allToolNames: string[];
  discovering: Record<string, boolean>;
  addServer: () => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  discoverTools: (id: string) => void;
  setServers: (servers: McpServerConfig[]) => void;
}

function createDefaultServer(): McpServerConfig {
  return {
    id: nanoid(),
    name: 'New MCP Server',
    transport: { type: 'sse', url: '' },
    enabled: true,
  };
}

function collectToolNames(discoveredTools: Record<string, DiscoveredTool[]>): string[] {
  const names = new Set<string>();
  for (const tools of Object.values(discoveredTools)) {
    for (const tool of tools) {
      names.add(tool.name);
    }
  }
  return [...names];
}

function removeKeyFromRecord<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function useServerMutations(
  setServers: React.Dispatch<React.SetStateAction<McpServerConfig[]>>,
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>
): {
  addServer: () => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
} {
  const addServer = useCallback(() => {
    setServers((prev) => [...prev, createDefaultServer()]);
  }, [setServers]);

  const removeServer = useCallback(
    (id: string) => {
      setServers((prev) => prev.filter((s) => s.id !== id));
      setDiscoveredTools((prev) => removeKeyFromRecord(prev, id));
    },
    [setServers, setDiscoveredTools]
  );

  const updateServer = useCallback(
    (id: string, updates: Partial<McpServerConfig>) => {
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [setServers]
  );

  return { addServer, removeServer, updateServer };
}

function useToolDiscovery(
  servers: McpServerConfig[],
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>,
  setDiscovering: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
): (id: string) => void {
  return useCallback(
    (id: string) => {
      const server = servers.find((s) => s.id === id);
      if (server === undefined) return;

      setDiscovering((prev) => ({ ...prev, [id]: true }));

      void discoverMcpTools(server.transport)
        .then((tools) => {
          setDiscoveredTools((prev) => ({ ...prev, [id]: tools }));
        })
        .catch(() => {
          setDiscoveredTools((prev) => ({ ...prev, [id]: [] }));
        })
        .finally(() => {
          setDiscovering((prev) => ({ ...prev, [id]: false }));
        });
    },
    [servers, setDiscoveredTools, setDiscovering]
  );
}

export function useMcpServers(): McpServersState {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [discoveredTools, setDiscoveredTools] = useState<Record<string, DiscoveredTool[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});

  const mutations = useServerMutations(setServers, setDiscoveredTools);
  const discoverTools = useToolDiscovery(servers, setDiscoveredTools, setDiscovering);
  const allToolNames = collectToolNames(discoveredTools);

  return { servers, discoveredTools, allToolNames, discovering, ...mutations, discoverTools, setServers };
}
