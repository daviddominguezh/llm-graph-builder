import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  addMcpServer,
  getMcpServer,
  installFromLibrary,
  listMcpServers,
  removeMcpServer,
  updateMcpServer,
} from '../services/mcpManagementService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared schemas                                                     */
/* ------------------------------------------------------------------ */

const transportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
]);

const variableValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), value: z.string() }),
  z.object({ type: z.literal('env_ref'), envVariableId: z.string() }),
]);

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListMcpServers(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_mcp_servers',
    {
      description: 'List all MCP servers configured for an agent',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listMcpServers(ctx, agentId);
      return textResult(result);
    }
  );
}

function registerGetMcpServer(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_mcp_server',
    {
      description: 'Get details of a specific MCP server by ID',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        serverId: z.string().describe('MCP server ID'),
      },
    },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getMcpServer(ctx, agentId, serverId);
      return textResult(result);
    }
  );
}

function registerAddMcpServer(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'add_mcp_server',
    {
      description: 'Add a new MCP server to an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        name: z.string().describe('Server name'),
        transport: transportSchema.describe('Transport configuration'),
        enabled: z.boolean().optional().describe('Whether the server is enabled'),
      },
    },
    async ({ agentSlug, name, transport, enabled }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addMcpServer(ctx, agentId, { name, transport, enabled });
      return textResult(result);
    }
  );
}

function registerUpdateMcpServer(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_mcp_server',
    {
      description: 'Update an existing MCP server configuration',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        serverId: z.string().describe('MCP server ID'),
        name: z.string().optional().describe('New server name'),
        transport: transportSchema.optional().describe('New transport configuration'),
        enabled: z.boolean().optional().describe('Enable or disable the server'),
      },
    },
    async ({ agentSlug, serverId, name, transport, enabled }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateMcpServer(ctx, agentId, serverId, { name, transport, enabled });
      return textResult({ success: true });
    }
  );
}

function registerRemoveMcpServer(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'remove_mcp_server',
    {
      description: 'Remove an MCP server from an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        serverId: z.string().describe('MCP server ID'),
      },
    },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await removeMcpServer(ctx, agentId, serverId);
      return textResult({ success: true });
    }
  );
}

function registerInstallMcpFromLibrary(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'install_mcp_from_library',
    {
      description: 'Install an MCP server from the library into an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        libraryItemId: z.string().describe('Library item ID to install'),
        variableValues: z.record(z.string(), variableValueSchema).optional().describe('Variable values'),
      },
    },
    async ({ agentSlug, libraryItemId, variableValues }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await installFromLibrary(ctx, agentId, libraryItemId, variableValues);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpManagementTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListMcpServers(server, getContext);
  registerGetMcpServer(server, getContext);
  registerAddMcpServer(server, getContext);
  registerUpdateMcpServer(server, getContext);
  registerRemoveMcpServer(server, getContext);
  registerInstallMcpFromLibrary(server, getContext);
}
