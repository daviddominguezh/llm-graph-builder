import { z } from 'zod';

const AgentOperationDataSchema = z.object({
  agentKey: z.string(),
  description: z.string().optional(),
});

export const InsertAgentOperationSchema = z.object({
  type: z.literal('insertAgent'),
  data: AgentOperationDataSchema,
});

export const UpdateAgentOperationSchema = z.object({
  type: z.literal('updateAgent'),
  data: AgentOperationDataSchema,
});

export const DeleteAgentOperationSchema = z.object({
  type: z.literal('deleteAgent'),
  agentKey: z.string(),
});
