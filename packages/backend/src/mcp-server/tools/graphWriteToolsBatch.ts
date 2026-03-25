import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { batchMutate } from '../services/graphWriteService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Operation schema (discriminated union matching Operation type)     */
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

const nodeDataSchema = z.object({
  nodeId: z.string(),
  text: z.string(),
  kind: z.enum(['agent', 'agent_decision']),
  description: z.string().optional(),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  global: z.boolean().optional(),
  outputSchemaId: z.string().optional(),
  outputPrompt: z.string().optional(),
});

const edgeDataSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: z.array(preconditionSchema).optional(),
  contextPreconditions: contextPreconditionsSchema.optional(),
});

const mutationOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('insertNode'), data: nodeDataSchema }),
  z.object({ type: z.literal('updateNode'), data: nodeDataSchema }),
  z.object({ type: z.literal('deleteNode'), nodeId: z.string() }),
  z.object({ type: z.literal('insertEdge'), data: edgeDataSchema }),
  z.object({ type: z.literal('updateEdge'), data: edgeDataSchema }),
  z.object({ type: z.literal('deleteEdge'), from: z.string(), to: z.string() }),
  z.object({ type: z.literal('updateStartNode'), startNode: z.string() }),
]);

/* ------------------------------------------------------------------ */
/*  Tool: batch_mutate                                                 */
/* ------------------------------------------------------------------ */

function registerBatchMutate(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'batch_mutate',
    {
      description: 'Apply multiple graph mutations atomically with automatic rollback on failure',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        operations: z.array(mutationOpSchema).describe('List of operations to apply in order'),
        validateAfter: z
          .boolean()
          .default(true)
          .optional()
          .describe('Read back graph after mutations for validation'),
      },
    },
    async ({ agentSlug, operations, validateAfter }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await batchMutate(ctx, agentId, operations, validateAfter);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerGraphWriteBatchTools(server: McpServer, getContext: () => ServiceContext): void {
  registerBatchMutate(server, getContext);
}
