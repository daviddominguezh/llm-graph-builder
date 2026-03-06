import { z } from 'zod';

export const AgentSchema = z.object({
  id: z.string(),
  description: z.string().default(''),
});
