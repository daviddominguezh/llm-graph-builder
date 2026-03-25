import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { getNodePrompt } from '../services/promptService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

const GET_NODE_PROMPT_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID to inspect'),
};

const GET_NODE_PROMPT_DESC =
  'Inspect what prompt the LLM would see at a given node, including routing options, ' +
  'fallback, output schema, global tools, and template variables';

export function registerPromptTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_node_prompt',
    { description: GET_NODE_PROMPT_DESC, inputSchema: GET_NODE_PROMPT_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNodePrompt(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_node_prompt',
    description: GET_NODE_PROMPT_DESC,
    category: 'prompt_inspection',
    inputSchema: z.toJSONSchema(z.object(GET_NODE_PROMPT_SCHEMA)) as Record<string, unknown>,
  });
}
