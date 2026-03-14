import { z } from 'zod';

import { VariableValueSchema } from './mcp-library.schema.js';
import { McpTransportSchema } from './mcp.schema.js';

const McpServerDataSchema = z.object({
  serverId: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().optional(),
  libraryItemId: z.string().optional(),
  variableValues: z.record(z.string(), VariableValueSchema).optional(),
});

export const InsertMcpServerOperationSchema = z.object({
  type: z.literal('insertMcpServer'),
  data: McpServerDataSchema,
});

export const UpdateMcpServerOperationSchema = z.object({
  type: z.literal('updateMcpServer'),
  data: McpServerDataSchema,
});

export const DeleteMcpServerOperationSchema = z.object({
  type: z.literal('deleteMcpServer'),
  serverId: z.string(),
});
