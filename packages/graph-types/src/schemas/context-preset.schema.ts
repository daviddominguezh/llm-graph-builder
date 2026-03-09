import { z } from 'zod';

export const ContextPresetSchema = z.object({
  name: z.string(),
  sessionId: z.string().optional(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
