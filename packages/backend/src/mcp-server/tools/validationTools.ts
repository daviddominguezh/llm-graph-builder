import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  findPath,
  getDeadEnds,
  getOrphans,
  getReachability,
  validateGraph,
} from '../services/validationService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: validate_graph                                               */
/* ------------------------------------------------------------------ */

function registerValidateGraph(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'validate_graph',
    {
      description: 'Run all validation checks on a graph and return a list of violations',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await validateGraph(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_reachability                                             */
/* ------------------------------------------------------------------ */

function registerGetReachability(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_reachability',
    {
      description: 'Run BFS from a node and return reachable/unreachable sets with depth map',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        fromNode: z.string().describe('Starting node ID'),
        maxDepth: z.number().optional().describe('Maximum BFS depth (default: unlimited)'),
      },
    },
    async ({ agentSlug, fromNode, maxDepth }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getReachability(ctx, agentId, fromNode, maxDepth);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: find_path                                                    */
/* ------------------------------------------------------------------ */

function registerFindPath(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'find_path',
    {
      description: 'Find the shortest path between two nodes in the graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
      },
    },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await findPath(ctx, agentId, from, to);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_dead_ends                                                */
/* ------------------------------------------------------------------ */

function registerGetDeadEnds(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_dead_ends',
    {
      description: 'Get IDs of all nodes that have no outbound edges and are not terminal',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getDeadEnds(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_orphans                                                  */
/* ------------------------------------------------------------------ */

function registerGetOrphans(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_orphans',
    {
      description: 'Get IDs of all nodes unreachable from the graph start node',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getOrphans(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerValidationTools(server: McpServer, getContext: () => ServiceContext): void {
  registerValidateGraph(server, getContext);
  registerGetReachability(server, getContext);
  registerFindPath(server, getContext);
  registerGetDeadEnds(server, getContext);
  registerGetOrphans(server, getContext);
}
