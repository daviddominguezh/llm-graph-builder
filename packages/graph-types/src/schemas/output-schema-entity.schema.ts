import { z } from 'zod';

import { OutputSchemaFieldSchema } from './output-schema.schema.js';

export const OutputSchemaEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(OutputSchemaFieldSchema),
});
