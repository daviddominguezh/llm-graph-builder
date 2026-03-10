import type { Operation } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
import type { McpServerConfig } from '../schemas/graph.schema';
import type { PushOperation } from '../utils/operationBuilders';

export type McpServerStatus = 'pending' | 'active';

export interface McpServersState {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  allToolNames: string[];
  allTools: DiscoveredTool[];
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

function collectAllTools(discoveredTools: Record<string, DiscoveredTool[]>): DiscoveredTool[] {
  const seen = new Set<string>();
  const result: DiscoveredTool[] = [];
  for (const tools of Object.values(discoveredTools)) {
    for (const tool of tools) {
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        result.push(tool);
      }
    }
  }
  return result;
}

function removeKeyFromRecord<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function buildInsertMcpOp(server: McpServerConfig): Operation {
  return {
    type: 'insertMcpServer',
    data: { serverId: server.id, name: server.name, transport: server.transport, enabled: server.enabled },
  };
}

function buildUpdateMcpOp(id: string, merged: McpServerConfig): Operation {
  return {
    type: 'updateMcpServer',
    data: { serverId: id, name: merged.name, transport: merged.transport, enabled: merged.enabled },
  };
}

function buildDeleteMcpOp(id: string): Operation {
  return { type: 'deleteMcpServer', serverId: id };
}

interface MutationSetters {
  setServers: React.Dispatch<React.SetStateAction<McpServerConfig[]>>;
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>;
  setServerStatus: React.Dispatch<React.SetStateAction<Record<string, McpServerStatus>>>;
  pushOperation: PushOperation;
}

function useServerMutations(setters: MutationSetters): {
  addServer: () => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
} {
  const { setServers, setDiscoveredTools, setServerStatus, pushOperation } = setters;

  const addServer = useCallback(() => {
    const server = createDefaultServer();
    setServers((prev) => [...prev, server]);
    pushOperation(buildInsertMcpOp(server));
  }, [setServers, pushOperation]);

  const removeServer = useCallback(
    (id: string) => {
      setServers((prev) => prev.filter((s) => s.id !== id));
      setDiscoveredTools((prev) => removeKeyFromRecord(prev, id));
      setServerStatus((prev) => removeKeyFromRecord(prev, id));
      pushOperation(buildDeleteMcpOp(id));
    },
    [setServers, setDiscoveredTools, setServerStatus, pushOperation]
  );

  const updateServer = useCallback(
    (id: string, updates: Partial<McpServerConfig>) => {
      setServers((prev) => {
        const updated = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
        const merged = updated.find((s) => s.id === id);
        if (merged !== undefined) pushOperation(buildUpdateMcpOp(id, merged));
        return updated;
      });
    },
    [setServers, pushOperation]
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

function buildInitialStatus(tools: Record<string, DiscoveredTool[]>): Record<string, McpServerStatus> {
  const status: Record<string, McpServerStatus> = {};
  for (const id of Object.keys(tools)) {
    status[id] = 'active';
  }
  return status;
}

export interface UseMcpServersOptions {
  initialServers: McpServerConfig[] | undefined;
  initialDiscoveredTools?: Record<string, DiscoveredTool[]>;
  pushOperation: PushOperation;
}

export function useMcpServers(options: UseMcpServersOptions): McpServersState {
  const { initialServers, initialDiscoveredTools, pushOperation } = options;
  const [servers, setServers] = useState<McpServerConfig[]>(initialServers ?? []);
  const [discoveredTools, setDiscoveredTools] = useState<Record<string, DiscoveredTool[]>>(
    initialDiscoveredTools ?? {}
  );
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});
  const [serverStatus, setServerStatus] = useState<Record<string, McpServerStatus>>(
    buildInitialStatus(initialDiscoveredTools ?? {})
  );

  const mutations = useServerMutations({ setServers, setDiscoveredTools, setServerStatus, pushOperation });
  const discoverTools = useToolDiscovery(servers, { setDiscoveredTools, setDiscovering, setServerStatus });
  const allToolNames = collectToolNames(discoveredTools);
  const allTools = collectAllTools(discoveredTools);

  return {
    servers,
    discoveredTools,
    allToolNames,
    allTools,
    discovering,
    serverStatus,
    ...mutations,
    discoverTools,
    setServers,
  };
}
