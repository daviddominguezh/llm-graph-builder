import { z } from 'zod';

import { BaseNodeKindSchema } from './node.schema.js';
import { PositionSchema } from './position.schema.js';

const NodeDataSchema = z.object({
  nodeId: z.string(),
  text: z.string(),
  kind: BaseNodeKindSchema,
  description: z.string().optional(),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  global: z.boolean().optional(),
  defaultFallback: z.boolean().optional(),
  position: PositionSchema.optional(),
});

export const InsertNodeOperationSchema = z.object({
  type: z.literal('insertNode'),
  data: NodeDataSchema,
});

export const UpdateNodeOperationSchema = z.object({
  type: z.literal('updateNode'),
  data: NodeDataSchema,
});

export const DeleteNodeOperationSchema = z.object({
  type: z.literal('deleteNode'),
  nodeId: z.string(),
});
