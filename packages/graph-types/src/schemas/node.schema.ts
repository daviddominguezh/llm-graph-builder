import { z } from 'zod';

import { OutputSchemaSchema } from './output-schema.schema.js';
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
  fallbackNodeId: z.string().optional(),
  global: z.boolean().default(false),
  defaultFallback: z.boolean().optional(),
  outputSchemaId: z.string().optional(),
  position: PositionSchema.optional(),
});

export const RuntimeNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: RuntimeNodeKindSchema,
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  previousNodeWasUser: z.boolean().optional(),
  isUser: z.boolean().optional(),
  global: z.boolean().default(false),
  outputSchema: OutputSchemaSchema,
  position: PositionSchema.optional(),
});
