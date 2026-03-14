import type { McpLibraryRow } from '@/app/lib/mcp-library-types';

import type { AddFromLibraryConfig, McpServersState } from '../hooks/useMcpServers';
import type { McpServerConfig } from '../schemas/graph.schema';

export function buildTransportFromLibrary(item: McpLibraryRow): McpServerConfig['transport'] {
  const config = item.transport_config;
  const type = item.transport_type;

  if (type === 'stdio') {
    return {
      type: 'stdio',
      command: typeof config['command'] === 'string' ? config['command'] : '',
      args: Array.isArray(config['args']) ? (config['args'] as string[]) : undefined,
    };
  }

  if (type === 'sse') {
    return {
      type: 'sse',
      url: typeof config['url'] === 'string' ? config['url'] : '',
    };
  }

  return {
    type: 'http',
    url: typeof config['url'] === 'string' ? config['url'] : '',
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
