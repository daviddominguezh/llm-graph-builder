import type { CallAgentOutput } from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { simulateAgent } from '../services/simulateService.js';
import type { SimulationExecutionParams } from '../services/simulateTypes.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Default runner (calls the real executeWithCallbacks)                */
/* ------------------------------------------------------------------ */

async function defaultRunSimulation(params: SimulationExecutionParams): Promise<CallAgentOutput | null> {
  return await executeWithCallbacks({
    context: {
      graph: params.graph,
      apiKey: params.apiKey,
      modelId: params.modelId,
      sessionID: 'mcp-simulation',
      tenantID: 'mcp',
      userID: 'mcp-user',
      data: params.data,
      quickReplies: {},
      toolsOverride: params.session.tools,
    },
    messages: params.messages,
    currentNode: params.currentNode,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool registration                                                  */
/* ------------------------------------------------------------------ */

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export function registerSimulateTools(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'simulate_agent',
    {
      description:
        'Run the agent graph with the given messages and return a debug trace including ' +
        'response text, visited nodes, tool calls, and token usage',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        messages: z.array(messageSchema).describe('Conversation messages to simulate'),
        currentNode: z.string().optional().describe('Node ID to start from (defaults to start node)'),
        modelId: z.string().optional().describe('Model override (e.g. openai/gpt-4o-mini)'),
        data: z.record(z.string(), z.unknown()).optional().describe('Extra data context for the agent'),
      },
    },
    async ({ agentSlug, messages, currentNode, modelId, data }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await simulateAgent(
        { ctx, agentId, agentSlug, input: { messages, currentNode, modelId, data } },
        defaultRunSimulation
      );
      return textResult(result);
    }
  );
}
