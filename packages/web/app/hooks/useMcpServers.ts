import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
import type { McpServerConfig } from '../schemas/graph.schema';

export type McpServerStatus = 'pending' | 'active';

export interface McpServersState {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  allToolNames: string[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
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
    transport: { type: 'http', url: '' },
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

interface MutationSetters {
  setServers: React.Dispatch<React.SetStateAction<McpServerConfig[]>>;
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>;
  setServerStatus: React.Dispatch<React.SetStateAction<Record<string, McpServerStatus>>>;
}

function useServerMutations(setters: MutationSetters): {
  addServer: () => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
} {
  const { setServers, setDiscoveredTools, setServerStatus } = setters;

  const addServer = useCallback(() => {
    setServers((prev) => [...prev, createDefaultServer()]);
  }, [setServers]);

  const removeServer = useCallback(
    (id: string) => {
      setServers((prev) => prev.filter((s) => s.id !== id));
      setDiscoveredTools((prev) => removeKeyFromRecord(prev, id));
      setServerStatus((prev) => removeKeyFromRecord(prev, id));
    },
    [setServers, setDiscoveredTools, setServerStatus]
  );

  const updateServer = useCallback(
    (id: string, updates: Partial<McpServerConfig>) => {
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [setServers]
  );

  return { addServer, removeServer, updateServer };
}

interface DiscoverySetters {
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>;
  setDiscovering: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setServerStatus: React.Dispatch<React.SetStateAction<Record<string, McpServerStatus>>>;
}

function useToolDiscovery(servers: McpServerConfig[], setters: DiscoverySetters): (id: string) => void {
  const { setDiscoveredTools, setDiscovering, setServerStatus } = setters;

  return useCallback(
    (id: string) => {
      const server = servers.find((s) => s.id === id);
      if (server === undefined) return;

      setDiscovering((prev) => ({ ...prev, [id]: true }));

      void discoverMcpTools(server.transport)
        .then((tools) => {
          setDiscoveredTools((prev) => ({ ...prev, [id]: tools }));
          setServerStatus((prev) => ({ ...prev, [id]: 'active' }));
          toast.success(`Discovered ${String(tools.length)} tools from ${server.name}`);
        })
        .catch((err: unknown) => {
          setDiscoveredTools((prev) => ({ ...prev, [id]: [] }));
          const msg = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to discover tools: ${msg}`);
        })
        .finally(() => {
          setDiscovering((prev) => ({ ...prev, [id]: false }));
        });
    },
    [servers, setDiscoveredTools, setDiscovering, setServerStatus]
  );
}

export function useMcpServers(initialServers?: McpServerConfig[]): McpServersState {
  const [servers, setServers] = useState<McpServerConfig[]>(initialServers ?? []);
  const [discoveredTools, setDiscoveredTools] = useState<Record<string, DiscoveredTool[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});
  const [serverStatus, setServerStatus] = useState<Record<string, McpServerStatus>>({});

  const mutations = useServerMutations({ setServers, setDiscoveredTools, setServerStatus });
  const discoverTools = useToolDiscovery(servers, { setDiscoveredTools, setDiscovering, setServerStatus });
  const allToolNames = collectToolNames(discoveredTools);

  return {
    servers,
    discoveredTools,
    allToolNames,
    discovering,
    serverStatus,
    ...mutations,
    discoverTools,
    setServers,
  };
}
