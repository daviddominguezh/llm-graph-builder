import type { McpServerConfig } from '@daviddh/graph-types';

import type { Provider } from '../provider.js';

/**
 * Stub for the MCP provider. Task 11 replaces this with a real implementation
 * that talks to the MCP transport (stdio/sse/http). Returning empty tool lists
 * keeps composeRegistry I/O-free at compose time and harmless at runtime
 * pending the real implementation.
 */
export function buildMcpProvider(server: McpServerConfig): Provider {
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    describeTools: async (): Promise<[]> => await Promise.resolve([]),
    buildTools: async (): Promise<Record<string, never>> => await Promise.resolve({}),
  };
}
