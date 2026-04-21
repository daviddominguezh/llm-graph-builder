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

export const InsertSkillOperationSchema = z.object({
  type: z.literal('insertSkill'),
  data: z.object({
    name: z.string(),
    description: z.string(),
    content: z.string(),
    repoUrl: z.string(),
    sortOrder: z.number(),
  }),
});

export const DeleteSkillOperationSchema = z.object({
  type: z.literal('deleteSkill'),
  data: z.object({
    name: z.string(),
  }),
});

export const DeleteManySkillsOperationSchema = z.object({
  type: z.literal('deleteManySkills'),
  data: z.object({
    names: z.array(z.string()),
  }),
});
