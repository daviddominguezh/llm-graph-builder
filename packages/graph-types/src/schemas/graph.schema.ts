import { z } from 'zod';

import { AgentSchema } from './agent.schema.js';
import { EdgeSchema, RuntimeEdgeSchema } from './edge.schema.js';
import { NodeSchema, RuntimeNodeSchema } from './node.schema.js';

export const GraphSchema = z.object({
  startNode: z.string(),
  agents: z.array(AgentSchema),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const RuntimeGraphSchema = z.object({
  startNode: z.string(),
  agents: z.array(AgentSchema),
  nodes: z.array(RuntimeNodeSchema),
  edges: z.array(RuntimeEdgeSchema),
  initialUserMessage: z.string().optional(),
});
