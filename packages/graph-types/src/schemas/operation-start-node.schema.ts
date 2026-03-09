import { z } from 'zod';

export const UpdateStartNodeOperationSchema = z.object({
  type: z.literal('updateStartNode'),
  startNode: z.string(),
});
