import { z } from 'zod';

import { OutputSchemaFieldSchema } from './output-schema.schema.js';

const OutputSchemaDataSchema = z.object({
  schemaId: z.string(),
  name: z.string(),
  fields: z.array(OutputSchemaFieldSchema),
});

export const InsertOutputSchemaOperationSchema = z.object({
  type: z.literal('insertOutputSchema'),
  data: OutputSchemaDataSchema,
});

export const UpdateOutputSchemaOperationSchema = z.object({
  type: z.literal('updateOutputSchema'),
  data: OutputSchemaDataSchema,
});

export const DeleteOutputSchemaOperationSchema = z.object({
  type: z.literal('deleteOutputSchema'),
  schemaId: z.string(),
});
