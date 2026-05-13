import { z } from 'zod';

const MIN_NAME_LEN = 1;
const MAX_PROVIDER_ID_LEN = 100;
const MAX_TOOL_NAME_LEN = 100;
export const MAX_SELECTED_TOOLS = 100;

export const SelectedToolSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(MIN_NAME_LEN).max(MAX_PROVIDER_ID_LEN),
  toolName: z.string().min(MIN_NAME_LEN).max(MAX_TOOL_NAME_LEN),
});

export const PatchSelectedToolsBodySchema = z.object({
  tools: z.array(SelectedToolSchema).max(MAX_SELECTED_TOOLS),
  expectedUpdatedAt: z.iso.datetime(),
});

export type PatchSelectedToolsBody = z.infer<typeof PatchSelectedToolsBodySchema>;
