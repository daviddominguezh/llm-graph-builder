import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { addEdge, deleteEdge, setStartNode, updateEdge } from '../services/graphWriteService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared precondition schemas                                        */
/* ------------------------------------------------------------------ */

const selectedToolRefSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string(),
  toolName: z.string(),
});

const preconditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_said'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('agent_decision'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_call'),
    tool: selectedToolRefSchema,
    description: z.string().optional(),
  }),
]);

const contextPreconditionsSchema = z.object({
  preconditions: z.array(z.string()),
  jumpTo: z.string().optional(),
});

const edgePreconditionFields = {
  preconditions: z.array(preconditionSchema).optional().describe('Edge preconditions'),
  contextPreconditions: contextPreconditionsSchema.optional().describe('Context-based preconditions'),
};

/* ------------------------------------------------------------------ */
/*  Tool schemas                                                       */
/* ------------------------------------------------------------------ */

const ADD_EDGE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
  ...edgePreconditionFields,
};

const UPDATE_EDGE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
  ...edgePreconditionFields,
};

const DELETE_EDGE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
};

const SET_START_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID to set as start'),
};

/* ------------------------------------------------------------------ */
/*  Tool: add_edge                                                     */
/* ------------------------------------------------------------------ */

function registerAddEdge(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_edge',
    { description: 'Add a new edge between two nodes in the agent graph', inputSchema: ADD_EDGE_SCHEMA },
    async ({ agentSlug, from, to, preconditions, contextPreconditions }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addEdge(ctx, agentId, { from, to, preconditions, contextPreconditions });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'add_edge',
    description: 'Add a new edge between two nodes in the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(ADD_EDGE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: update_edge                                                  */
/* ------------------------------------------------------------------ */

function registerUpdateEdge(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_edge',
    {
      description: 'Update preconditions of an existing edge in the agent graph',
      inputSchema: UPDATE_EDGE_SCHEMA,
    },
    async ({ agentSlug, from, to, preconditions, contextPreconditions }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateEdge(ctx, agentId, { from, to, fields: { preconditions, contextPreconditions } });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_edge',
    description: 'Update preconditions of an existing edge in the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(UPDATE_EDGE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_edge                                                  */
/* ------------------------------------------------------------------ */

function registerDeleteEdge(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_edge',
    { description: 'Delete an edge between two nodes in the agent graph', inputSchema: DELETE_EDGE_SCHEMA },
    async ({ agentSlug, from, to }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await deleteEdge(ctx, agentId, from, to);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_edge',
    description: 'Delete an edge between two nodes in the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(DELETE_EDGE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: set_start_node                                               */
/* ------------------------------------------------------------------ */

function registerSetStartNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'set_start_node',
    { description: 'Set the start node of the agent graph', inputSchema: SET_START_NODE_SCHEMA },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setStartNode(ctx, agentId, nodeId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'set_start_node',
    description: 'Set the start node of the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(SET_START_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphWriteEdgeTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerAddEdge(server, getContext, catalog);
  registerUpdateEdge(server, getContext, catalog);
  registerDeleteEdge(server, getContext, catalog);
  registerSetStartNode(server, getContext, catalog);
}
