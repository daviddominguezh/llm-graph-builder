import { z } from 'zod';

export const UpdateAgentConfigOperationSchema = z.object({
  type: z.literal('updateAgentConfig'),
  data: z.object({
    systemPrompt: z.string().optional(),
    maxSteps: z.number().nullable().optional(),
  }),
});

export const InsertContextItemOperationSchema = z.object({
  type: z.literal('insertContextItem'),
  data: z.object({
    sortOrder: z.number(),
    content: z.string(),
  }),
});

export const UpdateContextItemOperationSchema = z.object({
  type: z.literal('updateContextItem'),
  data: z.object({
    sortOrder: z.number(),
    content: z.string(),
  }),
});

export const DeleteContextItemOperationSchema = z.object({
  type: z.literal('deleteContextItem'),
  data: z.object({
    sortOrder: z.number(),
  }),
});

export const ReorderContextItemsOperationSchema = z.object({
  type: z.literal('reorderContextItems'),
  data: z.object({
    sortOrders: z.array(z.number()),
  }),
});
