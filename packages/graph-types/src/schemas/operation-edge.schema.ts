import { z } from 'zod';

import { ContextPreconditionsSchema, PreconditionsArraySchema } from './edge.schema.js';

const EdgeDataSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: PreconditionsArraySchema.optional(),
  contextPreconditions: ContextPreconditionsSchema.optional(),
});

export const InsertEdgeOperationSchema = z.object({
  type: z.literal('insertEdge'),
  data: EdgeDataSchema,
});

export const UpdateEdgeOperationSchema = z.object({
  type: z.literal('updateEdge'),
  data: EdgeDataSchema,
});

export const DeleteEdgeOperationSchema = z.object({
  type: z.literal('deleteEdge'),
  from: z.string(),
  to: z.string(),
});
