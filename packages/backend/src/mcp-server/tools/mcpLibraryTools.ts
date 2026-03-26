import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import { browseLibrary, getLibraryItem } from '../services/mcpLibraryService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const BROWSE_MCP_LIBRARY_SCHEMA = {
  query: z.string().optional().describe('Search query to filter by name'),
  category: z.string().optional().describe('Filter by category'),
  limit: z.number().optional().describe('Maximum number of results'),
  offset: z.number().optional().describe('Pagination offset'),
};

const GET_MCP_LIBRARY_ITEM_SCHEMA = {
  libraryItemId: z.string().describe('Library item ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerBrowseMcpLibrary(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'browse_mcp_library',
    { description: 'Browse the MCP server library', inputSchema: BROWSE_MCP_LIBRARY_SCHEMA },
    async ({ query, category, limit, offset }) => {
      const ctx = getContext();
      const result = await browseLibrary(ctx, { query, category, limit, offset });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'browse_mcp_library',
    description: 'Browse the MCP server library',
    category: 'mcp_library',
    inputSchema: z.toJSONSchema(z.object(BROWSE_MCP_LIBRARY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetMcpLibraryItem(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_mcp_library_item',
    {
      description: 'Get full details of an MCP library item by ID',
      inputSchema: GET_MCP_LIBRARY_ITEM_SCHEMA,
    },
    async ({ libraryItemId }) => {
      const ctx = getContext();
      const result = await getLibraryItem(ctx, libraryItemId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_mcp_library_item',
    description: 'Get full details of an MCP library item by ID',
    category: 'mcp_library',
    inputSchema: z.toJSONSchema(z.object(GET_MCP_LIBRARY_ITEM_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpLibraryTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerBrowseMcpLibrary(server, getContext, catalog);
  registerGetMcpLibraryItem(server, getContext, catalog);
}
