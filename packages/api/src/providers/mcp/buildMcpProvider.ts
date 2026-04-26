import type { McpServerConfig } from '@daviddh/graph-types';

import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import { describeAllAiSdkTools, filterToolsByNames } from './adapters.js';

/**
 * Build an MCP Provider for a single MCP server config. Connection mechanics
 * are delegated to ctx.mcpConnector — backend and edge function each supply
 * their own. See packages/api/src/providers/mcp/README.md for the architecture.
 *
 * Note: this naive impl opens-then-closes a connection per call. Plan E
 * (Redis caching) will cache `tools()` results across calls. Until then this
 * is the unoptimized but correct path.
 */
export function buildMcpProvider(server: McpServerConfig): Provider {
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    describeTools: async (ctx) => await describe(server, ctx),
    buildTools: async ({ toolNames, ctx }) => await build(server, toolNames, ctx),
  };
}

async function describe(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  if (ctx.mcpConnector === undefined) return [];
  const client = await ctx.mcpConnector.connect(server);
  try {
    const tools = await client.tools();
    return describeAllAiSdkTools(tools);
  } finally {
    await client.close();
  }
}

async function build(
  server: McpServerConfig,
  toolNames: string[],
  ctx: ProviderCtx
): Promise<Record<string, OpenFlowTool>> {
  if (ctx.mcpConnector === undefined) return {};
  const client = await ctx.mcpConnector.connect(server);
  try {
    const tools = await client.tools();
    return filterToolsByNames(tools, toolNames);
  } finally {
    await client.close();
  }
}
