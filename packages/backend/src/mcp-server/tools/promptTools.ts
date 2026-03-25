import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { getNodePrompt } from '../services/promptService.js';
import type { ServiceContext } from '../types.js';

export function registerPromptTools(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_node_prompt',
    {
      description:
        'Inspect what prompt the LLM would see at a given node, including routing options, ' +
        'fallback, output schema, global tools, and template variables',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID to inspect'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNodePrompt(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}
