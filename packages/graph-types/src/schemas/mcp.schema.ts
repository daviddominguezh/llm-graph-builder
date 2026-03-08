import { z } from 'zod';

export const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const SseTransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const HttpTransportSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const McpTransportSchema = z.discriminatedUnion('type', [
  StdioTransportSchema,
  SseTransportSchema,
  HttpTransportSchema,
]);

export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().default(true),
});
