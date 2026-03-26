import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import {
  findPath,
  getDeadEnds,
  getOrphans,
  getReachability,
  validateGraph,
} from '../services/validationService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const VALIDATE_GRAPH_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_REACHABILITY_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  fromNode: z.string().describe('Starting node ID'),
  maxDepth: z.number().optional().describe('Maximum BFS depth (default: unlimited)'),
};

const FIND_PATH_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
};

const GET_DEAD_ENDS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_ORPHANS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

/* ------------------------------------------------------------------ */
/*  Tool: validate_graph                                               */
/* ------------------------------------------------------------------ */

function registerValidateGraph(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'validate_graph',
    {
      description: 'Run all validation checks on a graph and return a list of violations',
      inputSchema: VALIDATE_GRAPH_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await validateGraph(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'validate_graph',
    description: 'Run all validation checks on a graph and return a list of violations',
    category: 'validation',
    inputSchema: z.toJSONSchema(z.object(VALIDATE_GRAPH_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_reachability                                             */
/* ------------------------------------------------------------------ */

function registerGetReachability(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_reachability',
    {
      description: 'Run BFS from a node and return reachable/unreachable sets with depth map',
      inputSchema: GET_REACHABILITY_SCHEMA,
    },
    async ({ agentSlug, fromNode, maxDepth }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getReachability(ctx, agentId, fromNode, maxDepth);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_reachability',
    description: 'Run BFS from a node and return reachable/unreachable sets with depth map',
    category: 'validation',
    inputSchema: z.toJSONSchema(z.object(GET_REACHABILITY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: find_path                                                    */
/* ------------------------------------------------------------------ */

function registerFindPath(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'find_path',
    {
      description: 'Find the shortest path between two nodes in the graph',
      inputSchema: FIND_PATH_SCHEMA,
    },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await findPath(ctx, agentId, from, to);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'find_path',
    description: 'Find the shortest path between two nodes in the graph',
    category: 'validation',
    inputSchema: z.toJSONSchema(z.object(FIND_PATH_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_dead_ends                                                */
/* ------------------------------------------------------------------ */

function registerGetDeadEnds(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_dead_ends',
    {
      description: 'Get IDs of all nodes that have no outbound edges and are not terminal',
      inputSchema: GET_DEAD_ENDS_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getDeadEnds(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_dead_ends',
    description: 'Get IDs of all nodes that have no outbound edges and are not terminal',
    category: 'validation',
    inputSchema: z.toJSONSchema(z.object(GET_DEAD_ENDS_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_orphans                                                  */
/* ------------------------------------------------------------------ */

function registerGetOrphans(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_orphans',
    {
      description: 'Get IDs of all nodes unreachable from the graph start node',
      inputSchema: GET_ORPHANS_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getOrphans(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_orphans',
    description: 'Get IDs of all nodes unreachable from the graph start node',
    category: 'validation',
    inputSchema: z.toJSONSchema(z.object(GET_ORPHANS_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerValidationTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerValidateGraph(server, getContext, catalog);
  registerGetReachability(server, getContext, catalog);
  registerFindPath(server, getContext, catalog);
  registerGetDeadEnds(server, getContext, catalog);
  registerGetOrphans(server, getContext, catalog);
}
