import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { explainEdge, getNodeFullContext } from '../services/nodeIntelligenceService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: get_node_full_context                                         */
/* ------------------------------------------------------------------ */

function registerGetNodeFullContext(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_node_full_context',
    {
      description:
        'Get full context for a node: details, prompt, inbound/outbound edges, reachability from start',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNodeFullContext(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: explain_edge                                                  */
/* ------------------------------------------------------------------ */

function registerExplainEdge(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'explain_edge',
    {
      description:
        'Generate a human-readable explanation of an edge transition, including preconditions and context flags',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
      },
    },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await explainEdge(ctx, agentId, from, to);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerNodeIntelligenceTools(server: McpServer, getContext: () => ServiceContext): void {
  registerGetNodeFullContext(server, getContext);
  registerExplainEdge(server, getContext);
}
