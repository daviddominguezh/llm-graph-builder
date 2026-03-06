import { z } from 'zod';

import { PositionSchema } from './position.schema.js';

export const BaseNodeKindSchema = z.enum(['agent', 'agent_decision']);

export const RuntimeNodeKindSchema = z.enum([
  'agent',
  'agent_decision',
  'tool',
  'success',
  'error',
  'decision',
  'info',
  'warning',
  'normal',
  'user_decision',
]);

export const NodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: BaseNodeKindSchema,
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  global: z.boolean().default(false),
  position: PositionSchema.optional(),
});

export const RuntimeNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: RuntimeNodeKindSchema,
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  previousNodeWasUser: z.boolean().optional(),
  isUser: z.boolean().optional(),
  global: z.boolean().default(false),
  position: PositionSchema.optional(),
});
