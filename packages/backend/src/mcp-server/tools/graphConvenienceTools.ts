import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  cloneNode,
  getMcpToolUsage,
  insertNodeBetween,
  listContextFlags,
  scaffoldAgentDomain,
  swapEdgeTarget,
} from '../services/graphConvenienceService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const CLONE_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Source node ID'),
  newId: z.string().describe('New node ID'),
  cloneEdges: z.boolean().optional().describe('Also clone outbound edges (default: false)'),
};

const INSERT_NODE_BETWEEN_DESC =
  'Insert a new node between two connected nodes, inheriting the original edge preconditions';

const INSERT_NODE_BETWEEN_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
  id: z.string().describe('New node ID'),
  text: z.string().describe('New node text/prompt'),
  kind: z.enum(['agent', 'agent_decision']).describe('New node kind'),
  description: z.string().optional().describe('New node description'),
  agent: z.string().optional().describe('Agent domain for new node'),
};

const SWAP_EDGE_TARGET_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  oldTo: z.string().describe('Current target node ID'),
  newTo: z.string().describe('New target node ID'),
};

const LIST_CONTEXT_FLAGS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_MCP_TOOL_USAGE_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const SCAFFOLD_AGENT_DOMAIN_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  domainKey: z.string().describe('Domain key (used as node ID prefix)'),
  description: z.string().describe('Domain description'),
  pattern: z.enum(['linear', 'decision_tree', 'tool_loop']).default('linear').describe('Scaffold pattern'),
};

/* ------------------------------------------------------------------ */
/*  Tool: clone_node                                                    */
/* ------------------------------------------------------------------ */

function registerCloneNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'clone_node',
    {
      description: 'Clone a node to a new ID, optionally cloning its outbound edges too',
      inputSchema: CLONE_NODE_SCHEMA,
    },
    async ({ agentSlug, nodeId, newId, cloneEdges }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await cloneNode(ctx, { agentId, nodeId, newId, cloneEdges });
      return textResult({ cloned: newId });
    }
  );
  catalog.register({
    name: 'clone_node',
    description: 'Clone a node to a new ID, optionally cloning its outbound edges too',
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(CLONE_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: insert_node_between                                           */
/* ------------------------------------------------------------------ */

function registerInsertNodeBetween(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'insert_node_between',
    { description: INSERT_NODE_BETWEEN_DESC, inputSchema: INSERT_NODE_BETWEEN_SCHEMA },
    async ({ agentSlug, from, to, id, text, kind, description, agent }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await insertNodeBetween(ctx, { agentId, from, to, newNode: { id, text, kind, description, agent } });
      return textResult({ inserted: id });
    }
  );
  catalog.register({
    name: 'insert_node_between',
    description: INSERT_NODE_BETWEEN_DESC,
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(INSERT_NODE_BETWEEN_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: swap_edge_target                                              */
/* ------------------------------------------------------------------ */

function registerSwapEdgeTarget(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'swap_edge_target',
    {
      description: 'Swap an edge target to point to a different node, preserving preconditions',
      inputSchema: SWAP_EDGE_TARGET_SCHEMA,
    },
    async ({ agentSlug, from, oldTo, newTo }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await swapEdgeTarget(ctx, { agentId, from, oldTo, newTo });
      return textResult({ swapped: { from, oldTo, newTo } });
    }
  );
  catalog.register({
    name: 'swap_edge_target',
    description: 'Swap an edge target to point to a different node, preserving preconditions',
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(SWAP_EDGE_TARGET_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: list_context_flags                                            */
/* ------------------------------------------------------------------ */

function registerListContextFlags(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_context_flags',
    {
      description: 'List all context flags used in edge preconditions, grouped by flag name',
      inputSchema: LIST_CONTEXT_FLAGS_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listContextFlags(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_context_flags',
    description: 'List all context flags used in edge preconditions, grouped by flag name',
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(LIST_CONTEXT_FLAGS_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_mcp_tool_usage                                            */
/* ------------------------------------------------------------------ */

function registerGetMcpToolUsage(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_mcp_tool_usage',
    {
      description: 'List all MCP tool names used in tool_call edges, with the edges that reference each tool',
      inputSchema: GET_MCP_TOOL_USAGE_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getMcpToolUsage(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_mcp_tool_usage',
    description: 'List all MCP tool names used in tool_call edges, with the edges that reference each tool',
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(GET_MCP_TOOL_USAGE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: scaffold_agent_domain                                         */
/* ------------------------------------------------------------------ */

function registerScaffoldAgentDomain(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'scaffold_agent_domain',
    {
      description: 'Scaffold a new agent domain with starter nodes and edges based on a pattern',
      inputSchema: SCAFFOLD_AGENT_DOMAIN_SCHEMA,
    },
    async ({ agentSlug, domainKey, pattern }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await scaffoldAgentDomain(ctx, agentId, domainKey, pattern);
      return textResult({ scaffolded: domainKey, pattern });
    }
  );
  catalog.register({
    name: 'scaffold_agent_domain',
    description: 'Scaffold a new agent domain with starter nodes and edges based on a pattern',
    category: 'graph_convenience',
    inputSchema: z.toJSONSchema(z.object(SCAFFOLD_AGENT_DOMAIN_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerGraphConvenienceTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerCloneNode(server, getContext, catalog);
  registerInsertNodeBetween(server, getContext, catalog);
  registerSwapEdgeTarget(server, getContext, catalog);
  registerListContextFlags(server, getContext, catalog);
  registerGetMcpToolUsage(server, getContext, catalog);
  registerScaffoldAgentDomain(server, getContext, catalog);
}
