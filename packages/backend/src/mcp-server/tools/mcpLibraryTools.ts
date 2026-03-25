import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import { browseLibrary, getLibraryItem } from '../services/mcpLibraryService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerBrowseMcpLibrary(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'browse_mcp_library',
    {
      description: 'Browse the MCP server library',
      inputSchema: {
        query: z.string().optional().describe('Search query to filter by name'),
        category: z.string().optional().describe('Filter by category'),
        limit: z.number().optional().describe('Maximum number of results'),
        offset: z.number().optional().describe('Pagination offset'),
      },
    },
    async ({ query, category, limit, offset }) => {
      const ctx = getContext();
      const result = await browseLibrary(ctx, { query, category, limit, offset });
      return textResult(result);
    }
  );
}

function registerGetMcpLibraryItem(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_mcp_library_item',
    {
      description: 'Get full details of an MCP library item by ID',
      inputSchema: {
        libraryItemId: z.string().describe('Library item ID'),
      },
    },
    async ({ libraryItemId }) => {
      const ctx = getContext();
      const result = await getLibraryItem(ctx, libraryItemId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerMcpLibraryTools(server: McpServer, getContext: () => ServiceContext): void {
  registerBrowseMcpLibrary(server, getContext);
  registerGetMcpLibraryItem(server, getContext);
}
