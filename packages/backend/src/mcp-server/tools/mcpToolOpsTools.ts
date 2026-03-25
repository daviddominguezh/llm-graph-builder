import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { callTool, discoverTools } from '../services/mcpToolService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerDiscoverMcpTools(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'discover_mcp_tools',
    {
      description: 'Discover available tools on an MCP server configured for an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        serverId: z.string().describe('MCP server ID'),
      },
    },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await discoverTools(ctx, agentId, serverId);
      return textResult(result);
    }
  );
}

function registerCallMcpTool(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'call_mcp_tool',
    {
      description: 'Call a specific tool on an MCP server configured for an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        serverId: z.string().describe('MCP server ID'),
        toolName: z.string().describe('Name of the tool to call'),
        args: z.record(z.string(), z.unknown()).describe('Arguments to pass to the tool'),
      },
    },
    async ({ agentSlug, serverId, toolName, args }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await callTool(ctx, agentId, serverId, toolName, args);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpToolOpsTools(server: McpServer, getContext: () => ServiceContext): void {
  registerDiscoverMcpTools(server, getContext);
  registerCallMcpTool(server, getContext);
}
