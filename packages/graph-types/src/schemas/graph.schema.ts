import { z } from 'zod';

import { AgentSchema } from './agent.schema.js';
import { EdgeSchema, RuntimeEdgeSchema } from './edge.schema.js';
import { McpServerConfigSchema } from './mcp.schema.js';
import { NodeSchema, RuntimeNodeSchema } from './node.schema.js';
import { OutputSchemaEntitySchema } from './output-schema-entity.schema.js';

export const GraphSchema = z.object({
  startNode: z.string(),
  agents: z.array(AgentSchema),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  mcpServers: z.array(McpServerConfigSchema).optional(),
  outputSchemas: z.array(OutputSchemaEntitySchema).optional(),
});

export const RuntimeGraphSchema = z.object({
  startNode: z.string(),
  agents: z.array(AgentSchema),
  nodes: z.array(RuntimeNodeSchema),
  edges: z.array(RuntimeEdgeSchema),
  initialUserMessage: z.string().optional(),
  mcpServers: z.array(McpServerConfigSchema).optional(),
});
