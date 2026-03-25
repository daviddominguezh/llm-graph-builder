import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { textResult } from '../helpers.js';
import { listAvailableModels } from '../services/modelService.js';
import type { ServiceContext } from '../types.js';

export function registerModelTools(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_available_models',
    {
      description: 'List all available LLM models from OpenRouter (org-scoped, cached)',
      inputSchema: {},
    },
    async () => {
      getContext();
      const models = await Promise.resolve(listAvailableModels());
      return textResult(models);
    }
  );
}
