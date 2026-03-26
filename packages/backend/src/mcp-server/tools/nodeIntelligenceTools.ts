import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { explainEdge, getNodeFullContext } from '../services/nodeIntelligenceService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const GET_NODE_FULL_CONTEXT_DESC =
  'Get full context for a node: details, prompt, inbound/outbound edges, reachability from start';

const GET_NODE_FULL_CONTEXT_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID'),
};

const EXPLAIN_EDGE_DESC =
  'Generate a human-readable explanation of an edge transition, including preconditions and context flags';

const EXPLAIN_EDGE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool: get_node_full_context                                         */
/* ------------------------------------------------------------------ */

function registerGetNodeFullContext(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_node_full_context',
    { description: GET_NODE_FULL_CONTEXT_DESC, inputSchema: GET_NODE_FULL_CONTEXT_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNodeFullContext(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_node_full_context',
    description: GET_NODE_FULL_CONTEXT_DESC,
    category: 'node_intelligence',
    inputSchema: z.toJSONSchema(z.object(GET_NODE_FULL_CONTEXT_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: explain_edge                                                  */
/* ------------------------------------------------------------------ */

function registerExplainEdge(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'explain_edge',
    { description: EXPLAIN_EDGE_DESC, inputSchema: EXPLAIN_EDGE_SCHEMA },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await explainEdge(ctx, agentId, from, to);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'explain_edge',
    description: EXPLAIN_EDGE_DESC,
    category: 'node_intelligence',
    inputSchema: z.toJSONSchema(z.object(EXPLAIN_EDGE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerNodeIntelligenceTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerGetNodeFullContext(server, getContext, catalog);
  registerExplainEdge(server, getContext, catalog);
}
