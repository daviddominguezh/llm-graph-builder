import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { addEdge, deleteEdge, setStartNode, updateEdge } from '../services/graphWriteService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared precondition schemas                                        */
/* ------------------------------------------------------------------ */

const preconditionSchema = z.object({
  type: z.enum(['user_said', 'agent_decision', 'tool_call']),
  value: z.string(),
  description: z.string().optional(),
});

const contextPreconditionsSchema = z.object({
  preconditions: z.array(z.string()),
  jumpTo: z.string().optional(),
});

const edgePreconditionFields = {
  preconditions: z.array(preconditionSchema).optional().describe('Edge preconditions'),
  contextPreconditions: contextPreconditionsSchema.optional().describe('Context-based preconditions'),
};

/* ------------------------------------------------------------------ */
/*  Tool: add_edge                                                     */
/* ------------------------------------------------------------------ */

function registerAddEdge(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'add_edge',
    {
      description: 'Add a new edge between two nodes in the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
        ...edgePreconditionFields,
      },
    },
    async ({ agentSlug, from, to, preconditions, contextPreconditions }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addEdge(ctx, agentId, { from, to, preconditions, contextPreconditions });
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: update_edge                                                  */
/* ------------------------------------------------------------------ */

function registerUpdateEdge(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_edge',
    {
      description: 'Update preconditions of an existing edge in the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
        ...edgePreconditionFields,
      },
    },
    async ({ agentSlug, from, to, preconditions, contextPreconditions }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateEdge(ctx, agentId, { from, to, fields: { preconditions, contextPreconditions } });
      return textResult({ success: true });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_edge                                                  */
/* ------------------------------------------------------------------ */

function registerDeleteEdge(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_edge',
    {
      description: 'Delete an edge between two nodes in the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        from: z.string().describe('Source node ID'),
        to: z.string().describe('Target node ID'),
      },
    },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await deleteEdge(ctx, agentId, from, to);
      return textResult({ success: true });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: set_start_node                                               */
/* ------------------------------------------------------------------ */

function registerSetStartNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'set_start_node',
    {
      description: 'Set the start node of the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID to set as start'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setStartNode(ctx, agentId, nodeId);
      return textResult({ success: true });
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphWriteEdgeTools(server: McpServer, getContext: () => ServiceContext): void {
  registerAddEdge(server, getContext);
  registerUpdateEdge(server, getContext);
  registerDeleteEdge(server, getContext);
  registerSetStartNode(server, getContext);
}
