import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { getToolSchemas, searchTools } from '../services/toolSearchService.js';

const SEARCH_TOOLS_DESCRIPTION =
  'Search for available tools by keyword. Returns tool names, descriptions, and categories. ' +
  'Use get_tool_schema to retrieve full input schemas before calling a discovered tool.';

const GET_TOOL_SCHEMA_DESCRIPTION =
  'Get full input schemas for specific tools. Call this after search_tools to get ' +
  'the parameter definitions needed to call a tool.';

const SEARCH_TOOLS_SCHEMA = {
  query: z
    .string()
    .describe(
      'Natural language or keyword query describing what you need. ' +
        'Examples: "create agent", "validate graph", "mcp server", "publish"'
    ),
};

const GET_TOOL_SCHEMA_SCHEMA = {
  toolNames: z.array(z.string()).describe('Array of tool names to get schemas for'),
};

function registerSearchTools(server: McpServer, catalog: CatalogEntry[]): void {
  server.registerTool(
    'search_tools',
    {
      description: SEARCH_TOOLS_DESCRIPTION,
      inputSchema: SEARCH_TOOLS_SCHEMA,
    },
    async ({ query }) => {
      const results = await Promise.resolve(searchTools(catalog, query));
      return textResult(results);
    }
  );
}

function registerGetToolSchema(server: McpServer, catalog: CatalogEntry[]): void {
  server.registerTool(
    'get_tool_schema',
    {
      description: GET_TOOL_SCHEMA_DESCRIPTION,
      inputSchema: GET_TOOL_SCHEMA_SCHEMA,
    },
    async ({ toolNames }) => {
      const results = await Promise.resolve(getToolSchemas(catalog, toolNames));
      return textResult(results);
    }
  );
}

export function registerToolSearchTools(server: McpServer, catalog: CatalogEntry[]): void {
  registerSearchTools(server, catalog);
  registerGetToolSchema(server, catalog);
}
