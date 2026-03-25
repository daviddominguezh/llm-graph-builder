import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import { listAvailableModels } from '../services/modelService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

const LIST_AVAILABLE_MODELS_SCHEMA = {};

export function registerModelTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_available_models',
    {
      description: 'List all available LLM models from OpenRouter (org-scoped, cached)',
      inputSchema: LIST_AVAILABLE_MODELS_SCHEMA,
    },
    async () => {
      getContext();
      const models = await Promise.resolve(listAvailableModels());
      return textResult(models);
    }
  );
  catalog.register({
    name: 'list_available_models',
    description: 'List all available LLM models from OpenRouter (org-scoped, cached)',
    category: 'models',
    inputSchema: z.toJSONSchema(z.object(LIST_AVAILABLE_MODELS_SCHEMA)) as Record<string, unknown>,
  });
}
