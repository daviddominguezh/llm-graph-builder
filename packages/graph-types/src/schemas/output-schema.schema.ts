import { z } from 'zod';

export const OutputSchemaFieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'enum',
  'object',
  'array',
]);

export type OutputSchemaField = {
  name: string;
  type: z.infer<typeof OutputSchemaFieldTypeSchema>;
  required: boolean;
  description?: string;
  enumValues?: string[];
  items?: OutputSchemaField;
  properties?: OutputSchemaField[];
};

export const OutputSchemaFieldSchema: z.ZodType<OutputSchemaField> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: OutputSchemaFieldTypeSchema,
    required: z.boolean(),
    description: z.string().optional(),
    enumValues: z.array(z.string()).optional(),
    items: OutputSchemaFieldSchema.optional(),
    properties: z.array(OutputSchemaFieldSchema).optional(),
  })
);

export const OutputSchemaSchema = z.array(OutputSchemaFieldSchema).optional();
