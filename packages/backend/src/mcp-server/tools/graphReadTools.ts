import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  getEdgesFrom,
  getEdgesTo,
  getGraphSummary,
  getNode,
  getSubgraph,
  listNodes,
  searchNodes,
} from '../services/graphReadService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: get_graph_summary                                            */
/* ------------------------------------------------------------------ */

function registerGetGraphSummary(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_graph_summary',
    {
      description: 'Get a high-level summary of an agent graph including node counts, agents, and flags',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getGraphSummary(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_node                                                     */
/* ------------------------------------------------------------------ */

function registerGetNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_node',
    {
      description: 'Get full details of a specific node including its inbound and outbound edge counts',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNode(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_edges_from                                               */
/* ------------------------------------------------------------------ */

function registerGetEdgesFrom(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_edges_from',
    {
      description: 'Get all edges originating from a specific node',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Source node ID'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getEdgesFrom(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_edges_to                                                 */
/* ------------------------------------------------------------------ */

function registerGetEdgesTo(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_edges_to',
    {
      description: 'Get all edges pointing to a specific node',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Target node ID'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getEdgesTo(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: list_nodes                                                   */
/* ------------------------------------------------------------------ */

function registerListNodes(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_nodes',
    {
      description: 'List nodes in an agent graph, optionally filtered by agent domain, kind, or global flag',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        agentDomain: z.string().optional().describe('Filter by agent domain ID'),
        kind: z.enum(['agent', 'agent_decision']).optional().describe('Filter by node kind'),
        global: z.boolean().optional().describe('Filter by global flag'),
      },
    },
    async ({ agentSlug, agentDomain, kind, global: globalFlag }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listNodes(ctx, agentId, { agentDomain, kind, global: globalFlag });
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: search_nodes                                                 */
/* ------------------------------------------------------------------ */

function registerSearchNodes(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'search_nodes',
    {
      description: 'Search for nodes by substring match on id, text, or description',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async ({ agentSlug, query, limit }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await searchNodes(ctx, agentId, query, limit);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_subgraph                                                 */
/* ------------------------------------------------------------------ */

function registerGetSubgraph(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_subgraph',
    {
      description: 'Get a subgraph of nodes and edges within a given BFS depth from a starting node',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Starting node ID'),
        depth: z.number().optional().describe('BFS depth (default: 1)'),
      },
    },
    async ({ agentSlug, nodeId, depth }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getSubgraph(ctx, agentId, nodeId, depth);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphReadTools(server: McpServer, getContext: () => ServiceContext): void {
  registerGetGraphSummary(server, getContext);
  registerGetNode(server, getContext);
  registerGetEdgesFrom(server, getContext);
  registerGetEdgesTo(server, getContext);
  registerListNodes(server, getContext);
  registerSearchNodes(server, getContext);
  registerGetSubgraph(server, getContext);
}
