import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { addNode, deleteNode, updateNode } from '../services/graphWriteService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared schemas                                                     */
/* ------------------------------------------------------------------ */

const nodeKindSchema = z.enum(['agent', 'agent_decision']);

const nodeOptionalFields = {
  description: z.string().optional().describe('Node description'),
  agent: z.string().optional().describe('Agent domain ID'),
  nextNodeIsUser: z.boolean().optional().describe('Whether next node is a user turn'),
  fallbackNodeId: z.string().optional().describe('Fallback node ID'),
  global: z.boolean().optional().describe('Whether the node is globally reachable'),
  outputSchemaId: z.string().optional().describe('Output schema ID'),
  outputPrompt: z.string().optional().describe('Output prompt'),
};

const ADD_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  id: z.string().describe('Node ID (unique within the graph)'),
  text: z.string().describe('Node prompt text'),
  kind: nodeKindSchema.describe('Node kind'),
  ...nodeOptionalFields,
};

const UPDATE_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID to update'),
  text: z.string().optional().describe('Node prompt text'),
  kind: nodeKindSchema.optional().describe('Node kind'),
  ...nodeOptionalFields,
};

const DELETE_NODE_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  nodeId: z.string().describe('Node ID to delete'),
};

/* ------------------------------------------------------------------ */
/*  Tool: add_node                                                     */
/* ------------------------------------------------------------------ */

function registerAddNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_node',
    { description: 'Add a new node to the agent graph', inputSchema: ADD_NODE_SCHEMA },
    async ({ agentSlug, id, text, kind, ...rest }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addNode(ctx, agentId, { id, text, kind, ...rest });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'add_node',
    description: 'Add a new node to the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(ADD_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: update_node                                                  */
/* ------------------------------------------------------------------ */

function registerUpdateNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_node',
    { description: 'Update fields of an existing node in the agent graph', inputSchema: UPDATE_NODE_SCHEMA },
    async ({ agentSlug, nodeId, ...fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await updateNode(ctx, agentId, nodeId, fields);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'update_node',
    description: 'Update fields of an existing node in the agent graph',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(UPDATE_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_node                                                  */
/* ------------------------------------------------------------------ */

function registerDeleteNode(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_node',
    {
      description: 'Delete a node from the agent graph along with its connected edges',
      inputSchema: DELETE_NODE_SCHEMA,
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await deleteNode(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'delete_node',
    description: 'Delete a node from the agent graph along with its connected edges',
    category: 'graph_write',
    inputSchema: z.toJSONSchema(z.object(DELETE_NODE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphWriteNodeTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerAddNode(server, getContext, catalog);
  registerUpdateNode(server, getContext, catalog);
  registerDeleteNode(server, getContext, catalog);
}
