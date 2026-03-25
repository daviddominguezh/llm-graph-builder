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
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: clone_node                                                    */
/* ------------------------------------------------------------------ */

function registerCloneNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'clone_node',
    {
      description: 'Clone a node to a new ID, optionally cloning its outbound edges too',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Source node ID'),
        newId: z.string().describe('New node ID'),
        cloneEdges: z.boolean().optional().describe('Also clone outbound edges (default: false)'),
      },
    },
    async ({ agentSlug, nodeId, newId, cloneEdges }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await cloneNode(ctx, agentId, nodeId, newId, cloneEdges);
      return textResult({ cloned: newId });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: insert_node_between                                           */
/* ------------------------------------------------------------------ */

function registerInsertNodeBetween(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'insert_node_between',
    {
      description: 'Insert a new node between two connected nodes, inheriting the original edge preconditions',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
        id: z.string().describe('New node ID'),
        text: z.string().describe('New node text/prompt'),
        kind: z.enum(['agent', 'agent_decision']).describe('New node kind'),
        description: z.string().optional().describe('New node description'),
        agent: z.string().optional().describe('Agent domain for new node'),
      },
    },
    async ({ agentSlug, from, to, id, text, kind, description, agent }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await insertNodeBetween(ctx, agentId, from, to, { id, text, kind, description, agent });
      return textResult({ inserted: id });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: swap_edge_target                                              */
/* ------------------------------------------------------------------ */

function registerSwapEdgeTarget(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'swap_edge_target',
    {
      description: 'Swap an edge target to point to a different node, preserving preconditions',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        oldTo: z.string().describe('Current target node ID'),
        newTo: z.string().describe('New target node ID'),
      },
    },
    async ({ agentSlug, from, oldTo, newTo }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await swapEdgeTarget(ctx, agentId, from, oldTo, newTo);
      return textResult({ swapped: { from, oldTo, newTo } });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: list_context_flags                                            */
/* ------------------------------------------------------------------ */

function registerListContextFlags(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_context_flags',
    {
      description: 'List all context flags used in edge preconditions, grouped by flag name',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listContextFlags(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_mcp_tool_usage                                            */
/* ------------------------------------------------------------------ */

function registerGetMcpToolUsage(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_mcp_tool_usage',
    {
      description: 'List all MCP tool names used in tool_call edges, with the edges that reference each tool',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getMcpToolUsage(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: scaffold_agent_domain                                         */
/* ------------------------------------------------------------------ */

function registerScaffoldAgentDomain(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'scaffold_agent_domain',
    {
      description: 'Scaffold a new agent domain with starter nodes and edges based on a pattern',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        domainKey: z.string().describe('Domain key (used as node ID prefix)'),
        description: z.string().describe('Domain description'),
        pattern: z
          .enum(['linear', 'decision_tree', 'tool_loop'])
          .default('linear')
          .describe('Scaffold pattern'),
      },
    },
    async ({ agentSlug, domainKey, pattern }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await scaffoldAgentDomain(ctx, agentId, domainKey, pattern);
      return textResult({ scaffolded: domainKey, pattern });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerGraphConvenienceTools(server: McpServer, getContext: () => ServiceContext): void {
  registerCloneNode(server, getContext);
  registerInsertNodeBetween(server, getContext);
  registerSwapEdgeTarget(server, getContext);
  registerListContextFlags(server, getContext);
  registerGetMcpToolUsage(server, getContext);
  registerScaffoldAgentDomain(server, getContext);
}
