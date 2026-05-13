import type { McpLibraryRow } from '@/app/lib/mcpLibraryTypes';

import type { AddFromLibraryConfig, McpServersState } from '../hooks/useMcpServers';
import type { McpServerConfig } from '../schemas/graph.schema';

function parseHeaders(config: Record<string, unknown>): Record<string, string> | undefined {
  const raw = config.headers;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') headers[k] = v;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function buildTransportFromLibrary(item: McpLibraryRow): McpServerConfig['transport'] {
  const config = item.transport_config;
  const type = item.transport_type;

  if (type === 'stdio') {
    return {
      type: 'stdio',
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? (config.args as string[]) : undefined,
    };
  }

  if (type === 'sse') {
    return {
      type: 'sse',
      url: typeof config.url === 'string' ? config.url : '',
      headers: parseHeaders(config),
    };
  }

  return {
    type: 'http',
    url: typeof config.url === 'string' ? config.url : '',
    headers: parseHeaders(config),
  };
}

export function buildLibraryConfig(item: McpLibraryRow): AddFromLibraryConfig {
  return {
    name: item.name,
    transport: buildTransportFromLibrary(item),
    libraryItemId: item.id,
    variables: item.variables,
  };
}

export function getInstalledLibraryIds(servers: McpServersState['servers']): string[] {
  return servers.reduce<string[]>((acc, s) => {
    if (s.libraryItemId !== undefined) acc.push(s.libraryItemId);
    return acc;
  }, []);
}
