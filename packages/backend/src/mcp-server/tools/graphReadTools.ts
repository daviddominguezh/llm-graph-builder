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
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const GET_GRAPH_SUMMARY_DESC =
  'Get a high-level summary of an agent graph including node counts, agents, and flags';
const GET_GRAPH_SUMMARY_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_NODE_DESC = 'Get full details of a specific node including its inbound and outbound edge counts';
const GET_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID'),
};

const GET_EDGES_FROM_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Source node ID'),
};

const GET_EDGES_TO_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Target node ID'),
};

const LIST_NODES_DESC =
  'List nodes in an agent graph, optionally filtered by agent domain, kind, or global flag';
const LIST_NODES_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  agentDomain: z.string().optional().describe('Filter by agent domain ID'),
  kind: z.enum(['agent', 'agent_decision']).optional().describe('Filter by node kind'),
  global: z.boolean().optional().describe('Filter by global flag'),
};

const SEARCH_NODES_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  query: z.string().describe('Search query'),
  limit: z.number().optional().describe('Maximum number of results (default: 10)'),
};

const GET_SUBGRAPH_DESC = 'Get a subgraph of nodes and edges within a given BFS depth from a starting node';
const GET_SUBGRAPH_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Starting node ID'),
  depth: z.number().optional().describe('BFS depth (default: 1)'),
};

/* ------------------------------------------------------------------ */
/*  Tool: get_graph_summary                                            */
/* ------------------------------------------------------------------ */

function registerGetGraphSummary(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_graph_summary',
    { description: GET_GRAPH_SUMMARY_DESC, inputSchema: GET_GRAPH_SUMMARY_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getGraphSummary(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_graph_summary',
    description: GET_GRAPH_SUMMARY_DESC,
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(GET_GRAPH_SUMMARY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_node                                                     */
/* ------------------------------------------------------------------ */

function registerGetNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_node',
    { description: GET_NODE_DESC, inputSchema: GET_NODE_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getNode(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_node',
    description: GET_NODE_DESC,
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(GET_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_edges_from                                               */
/* ------------------------------------------------------------------ */

function registerGetEdgesFrom(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_edges_from',
    { description: 'Get all edges originating from a specific node', inputSchema: GET_EDGES_FROM_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getEdgesFrom(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_edges_from',
    description: 'Get all edges originating from a specific node',
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(GET_EDGES_FROM_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_edges_to                                                 */
/* ------------------------------------------------------------------ */

function registerGetEdgesTo(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_edges_to',
    { description: 'Get all edges pointing to a specific node', inputSchema: GET_EDGES_TO_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getEdgesTo(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_edges_to',
    description: 'Get all edges pointing to a specific node',
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(GET_EDGES_TO_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: list_nodes                                                   */
/* ------------------------------------------------------------------ */

function registerListNodes(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_nodes',
    { description: LIST_NODES_DESC, inputSchema: LIST_NODES_SCHEMA },
    async ({ agentSlug, agentDomain, kind, global: globalFlag }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listNodes(ctx, agentId, { agentDomain, kind, global: globalFlag });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_nodes',
    description: LIST_NODES_DESC,
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(LIST_NODES_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: search_nodes                                                 */
/* ------------------------------------------------------------------ */

function registerSearchNodes(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'search_nodes',
    {
      description: 'Search for nodes by substring match on id, text, or description',
      inputSchema: SEARCH_NODES_SCHEMA,
    },
    async ({ agentSlug, query, limit }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await searchNodes(ctx, agentId, query, limit);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'search_nodes',
    description: 'Search for nodes by substring match on id, text, or description',
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(SEARCH_NODES_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_subgraph                                                 */
/* ------------------------------------------------------------------ */

function registerGetSubgraph(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_subgraph',
    { description: GET_SUBGRAPH_DESC, inputSchema: GET_SUBGRAPH_SCHEMA },
    async ({ agentSlug, nodeId, depth }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getSubgraph(ctx, agentId, nodeId, depth);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_subgraph',
    description: GET_SUBGRAPH_DESC,
    category: 'graph_read',
    inputSchema: z.toJSONSchema(z.object(GET_SUBGRAPH_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphReadTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerGetGraphSummary(server, getContext, catalog);
  registerGetNode(server, getContext, catalog);
  registerGetEdgesFrom(server, getContext, catalog);
  registerGetEdgesTo(server, getContext, catalog);
  registerListNodes(server, getContext, catalog);
  registerSearchNodes(server, getContext, catalog);
  registerGetSubgraph(server, getContext, catalog);
}
