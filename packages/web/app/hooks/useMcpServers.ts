import type { Operation } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { getOAuthConnectionStatus } from '../actions/mcp-oauth';
import { type DiscoveredTool, discoverMcpTools } from '../lib/api';
import type { McpLibraryRow } from '../lib/mcp-library-types';
import { initiateOAuthFlow } from '../lib/mcp-oauth-client';
import type { McpServerConfig } from '../schemas/graph.schema';
import type { PushOperation } from '../utils/operationBuilders';

export type McpServerStatus = 'pending' | 'active';

export interface AddFromLibraryConfig {
  name: string;
  transport: McpServerConfig['transport'];
  libraryItemId: string;
  variables: Array<{ name: string }>;
}

export interface McpServersState {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  allToolNames: string[];
  allTools: DiscoveredTool[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  addServer: () => void;
  addServerFromLibrary: (config: AddFromLibraryConfig) => McpServerConfig;
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
  const allTools = Object.values(discoveredTools).flat();
  return allTools.filter((tool) => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}

function removeKeyFromRecord<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function buildInsertMcpOp(server: McpServerConfig): Operation {
  return {
    type: 'insertMcpServer',
    data: {
      serverId: server.id,
      name: server.name,
      transport: server.transport,
      enabled: server.enabled,
      libraryItemId: server.libraryItemId,
      variableValues: server.variableValues,
    },
  };
}

function buildUpdateMcpOp(id: string, merged: McpServerConfig): Operation {
  return {
    type: 'updateMcpServer',
    data: {
      serverId: id,
      name: merged.name,
      transport: merged.transport,
      enabled: merged.enabled,
      libraryItemId: merged.libraryItemId,
      variableValues: merged.variableValues,
    },
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

interface ServerMutations {
  addServer: () => void;
  addServerFromLibrary: (config: AddFromLibraryConfig) => McpServerConfig;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void;
}

function buildEmptyVariableValues(
  variables: Array<{ name: string }>
): Record<string, { type: 'direct'; value: string }> {
  const values: Record<string, { type: 'direct'; value: string }> = {};
  for (const v of variables) {
    values[v.name] = { type: 'direct', value: '' };
  }
  return values;
}

function useServerMutations(setters: MutationSetters): ServerMutations {
  const { setServers, setDiscoveredTools, setServerStatus, pushOperation } = setters;

  const addServer = useCallback(() => {
    const server = createDefaultServer();
    setServers((prev) => [...prev, server]);
    pushOperation(buildInsertMcpOp(server));
  }, [setServers, pushOperation]);

  const addServerFromLibrary = useCallback(
    (config: AddFromLibraryConfig): McpServerConfig => {
      const server: McpServerConfig = {
        id: nanoid(),
        name: config.name,
        transport: config.transport,
        enabled: true,
        libraryItemId: config.libraryItemId,
        variableValues: buildEmptyVariableValues(config.variables),
      };
      setServers((prev) => [...prev, server]);
      pushOperation(buildInsertMcpOp(server));
      return server;
    },
    [setServers, pushOperation]
  );

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

  return { addServer, addServerFromLibrary, removeServer, updateServer };
}

interface DiscoverySetters {
  setDiscoveredTools: React.Dispatch<React.SetStateAction<Record<string, DiscoveredTool[]>>>;
  setDiscovering: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setServerStatus: React.Dispatch<React.SetStateAction<Record<string, McpServerStatus>>>;
}

function getLibraryAuthType(
  libraryItems: McpLibraryRow[],
  libraryItemId: string | undefined
): string | undefined {
  if (libraryItemId === undefined) return undefined;
  return libraryItems.find((item) => item.id === libraryItemId)?.auth_type;
}

interface OAuthDiscoverParams {
  server: McpServerConfig;
  orgId: string;
  setDiscovering: DiscoverySetters['setDiscovering'];
}

async function handleOAuthDiscover(params: OAuthDiscoverParams): Promise<boolean> {
  const { server, orgId, setDiscovering } = params;
  const libraryItemId = server.libraryItemId ?? '';
  const status = await getOAuthConnectionStatus(orgId, libraryItemId);
  if (status.connected) return false;
  setDiscovering((prev) => ({ ...prev, [server.id]: false }));
  await initiateOAuthFlow(orgId, libraryItemId);
  return true;
}

interface NormalDiscoverParams {
  server: McpServerConfig;
  id: string;
  setters: DiscoverySetters;
}

function runNormalDiscover(params: NormalDiscoverParams): void {
  const { server, id, setters } = params;
  const { setDiscoveredTools, setDiscovering, setServerStatus } = setters;

  void discoverMcpTools(server.transport, server.variableValues)
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
}

interface DiscoveryContext {
  servers: McpServerConfig[];
  libraryItems: McpLibraryRow[];
  orgId: string;
  setters: DiscoverySetters;
}

function discoverForServer(ctx: DiscoveryContext, id: string): void {
  const { servers, libraryItems, orgId, setters } = ctx;
  const server = servers.find((s) => s.id === id);
  if (server === undefined) return;

  setters.setDiscovering((prev) => ({ ...prev, [id]: true }));
  const authType = getLibraryAuthType(libraryItems, server.libraryItemId);

  if (authType === 'oauth') {
    void handleOAuthDiscover({ server, orgId, setDiscovering: setters.setDiscovering }).then((redirected) => {
      if (!redirected) runNormalDiscover({ server, id, setters });
    });
    return;
  }

  runNormalDiscover({ server, id, setters });
}

function useToolDiscovery(ctx: DiscoveryContext): (id: string) => void {
  const { servers, libraryItems, orgId, setters } = ctx;

  return useCallback(
    (id: string) => discoverForServer({ servers, libraryItems, orgId, setters }, id),
    [servers, libraryItems, orgId, setters]
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
  libraryItems?: McpLibraryRow[];
  orgId?: string;
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
  const setters = { setDiscoveredTools, setDiscovering, setServerStatus };
  const discoverTools = useToolDiscovery({
    servers,
    libraryItems: options.libraryItems ?? [],
    orgId: options.orgId ?? '',
    setters,
  });
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
