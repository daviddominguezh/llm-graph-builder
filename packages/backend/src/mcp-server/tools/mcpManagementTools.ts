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
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
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
/*  Tool schemas                                                       */
/* ------------------------------------------------------------------ */

const LIST_MCP_SERVERS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_MCP_SERVER_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  serverId: z.string().describe('MCP server ID'),
};

const ADD_MCP_SERVER_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  name: z.string().describe('Server name'),
  transport: transportSchema.describe('Transport configuration'),
  enabled: z.boolean().optional().describe('Whether the server is enabled'),
};

const UPDATE_MCP_SERVER_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  serverId: z.string().describe('MCP server ID'),
  name: z.string().optional().describe('New server name'),
  transport: transportSchema.optional().describe('New transport configuration'),
  enabled: z.boolean().optional().describe('Enable or disable the server'),
};

const REMOVE_MCP_SERVER_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  serverId: z.string().describe('MCP server ID'),
};

const INSTALL_MCP_FROM_LIBRARY_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  libraryItemId: z.string().describe('Library item ID to install'),
  variableValues: z.record(z.string(), variableValueSchema).optional().describe('Variable values'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListMcpServers(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_mcp_servers',
    { description: 'List all MCP servers configured for an agent', inputSchema: LIST_MCP_SERVERS_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listMcpServers(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_mcp_servers',
    description: 'List all MCP servers configured for an agent',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(LIST_MCP_SERVERS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetMcpServer(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_mcp_server',
    { description: 'Get details of a specific MCP server by ID', inputSchema: GET_MCP_SERVER_SCHEMA },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getMcpServer(ctx, agentId, serverId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_mcp_server',
    description: 'Get details of a specific MCP server by ID',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(GET_MCP_SERVER_SCHEMA)) as Record<string, unknown>,
  });
}

function registerAddMcpServer(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_mcp_server',
    { description: 'Add a new MCP server to an agent', inputSchema: ADD_MCP_SERVER_SCHEMA },
    async ({ agentSlug, name, transport, enabled }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addMcpServer(ctx, agentId, { name, transport, enabled });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'add_mcp_server',
    description: 'Add a new MCP server to an agent',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(ADD_MCP_SERVER_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateMcpServer(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_mcp_server',
    { description: 'Update an existing MCP server configuration', inputSchema: UPDATE_MCP_SERVER_SCHEMA },
    async ({ agentSlug, serverId, name, transport, enabled }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateMcpServer(ctx, agentId, serverId, { name, transport, enabled });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_mcp_server',
    description: 'Update an existing MCP server configuration',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(UPDATE_MCP_SERVER_SCHEMA)) as Record<string, unknown>,
  });
}

function registerRemoveMcpServer(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'remove_mcp_server',
    { description: 'Remove an MCP server from an agent', inputSchema: REMOVE_MCP_SERVER_SCHEMA },
    async ({ agentSlug, serverId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await removeMcpServer(ctx, agentId, serverId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'remove_mcp_server',
    description: 'Remove an MCP server from an agent',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(REMOVE_MCP_SERVER_SCHEMA)) as Record<string, unknown>,
  });
}

function registerInstallMcpFromLibrary(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'install_mcp_from_library',
    {
      description: 'Install an MCP server from the library into an agent',
      inputSchema: INSTALL_MCP_FROM_LIBRARY_SCHEMA,
    },
    async ({ agentSlug, libraryItemId, variableValues }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await installFromLibrary(ctx, agentId, libraryItemId, variableValues);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'install_mcp_from_library',
    description: 'Install an MCP server from the library into an agent',
    category: 'mcp_management',
    inputSchema: z.toJSONSchema(z.object(INSTALL_MCP_FROM_LIBRARY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpManagementTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListMcpServers(server, getContext, catalog);
  registerGetMcpServer(server, getContext, catalog);
  registerAddMcpServer(server, getContext, catalog);
  registerUpdateMcpServer(server, getContext, catalog);
  registerRemoveMcpServer(server, getContext, catalog);
  registerInstallMcpFromLibrary(server, getContext, catalog);
}
