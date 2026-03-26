import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { callTool, discoverTools } from '../services/mcpToolService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const DISCOVER_MCP_TOOLS_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  serverId: z.string().describe('MCP server ID'),
};

const CALL_MCP_TOOL_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  serverId: z.string().describe('MCP server ID'),
  toolName: z.string().describe('Name of the tool to call'),
  args: z.record(z.string(), z.unknown()).describe('Arguments to pass to the tool'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerDiscoverMcpTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'discover_mcp_tools',
    {
      description: 'Discover available tools on an MCP server configured for an agent',
      inputSchema: DISCOVER_MCP_TOOLS_SCHEMA,
    },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await discoverTools(ctx, agentId, serverId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'discover_mcp_tools',
    description: 'Discover available tools on an MCP server configured for an agent',
    category: 'mcp_tool_ops',
    inputSchema: z.toJSONSchema(z.object(DISCOVER_MCP_TOOLS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerCallMcpTool(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'call_mcp_tool',
    {
      description: 'Call a specific tool on an MCP server configured for an agent',
      inputSchema: CALL_MCP_TOOL_SCHEMA,
    },
    async ({ agentSlug, serverId, toolName, args }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await callTool(ctx, { agentId, serverId, toolName, args });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'call_mcp_tool',
    description: 'Call a specific tool on an MCP server configured for an agent',
    category: 'mcp_tool_ops',
    inputSchema: z.toJSONSchema(z.object(CALL_MCP_TOOL_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpToolOpsTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerDiscoverMcpTools(server, getContext, catalog);
  registerCallMcpTool(server, getContext, catalog);
}
