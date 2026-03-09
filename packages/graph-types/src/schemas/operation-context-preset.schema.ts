import { z } from 'zod';

import { ContextPresetSchema } from './context-preset.schema.js';

export const InsertContextPresetOperationSchema = z.object({
  type: z.literal('insertContextPreset'),
  data: ContextPresetSchema,
});

export const UpdateContextPresetOperationSchema = z.object({
  type: z.literal('updateContextPreset'),
  data: ContextPresetSchema,
});

export const DeleteContextPresetOperationSchema = z.object({
  type: z.literal('deleteContextPreset'),
  name: z.string(),
});
