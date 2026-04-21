import { McpServerConfigSchema } from '@daviddh/graph-types';
import { z } from 'zod';

export const AgentConfigExportSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  maxSteps: z.number().nullable(),
  contextItems: z.array(z.string()),
  mcpServers: z.array(McpServerConfigSchema).optional(),
});

export type AgentConfigExport = z.infer<typeof AgentConfigExportSchema>;
