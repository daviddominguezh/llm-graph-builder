import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { addNode, deleteNode, updateNode } from '../services/graphWriteService.js';
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

/* ------------------------------------------------------------------ */
/*  Tool: add_node                                                     */
/* ------------------------------------------------------------------ */

function registerAddNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'add_node',
    {
      description: 'Add a new node to the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        id: z.string().describe('Node ID (unique within the graph)'),
        text: z.string().describe('Node prompt text'),
        kind: nodeKindSchema.describe('Node kind'),
        ...nodeOptionalFields,
      },
    },
    async ({ agentSlug, id, text, kind, ...rest }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addNode(ctx, agentId, { id, text, kind, ...rest });
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: update_node                                                  */
/* ------------------------------------------------------------------ */

function registerUpdateNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_node',
    {
      description: 'Update fields of an existing node in the agent graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID to update'),
        text: z.string().optional().describe('Node prompt text'),
        kind: nodeKindSchema.optional().describe('Node kind'),
        ...nodeOptionalFields,
      },
    },
    async ({ agentSlug, nodeId, ...fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await updateNode(ctx, agentId, nodeId, fields);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_node                                                  */
/* ------------------------------------------------------------------ */

function registerDeleteNode(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_node',
    {
      description: 'Delete a node from the agent graph along with its connected edges',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        nodeId: z.string().describe('Node ID to delete'),
      },
    },
    async ({ agentSlug, nodeId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await deleteNode(ctx, agentId, nodeId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphWriteNodeTools(server: McpServer, getContext: () => ServiceContext): void {
  registerAddNode(server, getContext);
  registerUpdateNode(server, getContext);
  registerDeleteNode(server, getContext);
}
