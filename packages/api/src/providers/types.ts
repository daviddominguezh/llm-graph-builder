import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import type { z } from 'zod';

/**
 * Project-local tool shape. Decouples Provider implementations from the AI SDK's
 * `Tool` type so AI SDK breaking changes don't cascade across every provider.
 * Adapter `toAiSdkTool` is the only place that imports from 'ai'.
 */
export interface OpenFlowTool<Schema extends z.ZodType = z.ZodType, Output = unknown> {
  description: string;
  inputSchema: Schema;
  execute: (args: z.infer<Schema>) => Promise<Output> | Output;
}

export function toAiSdkTool<S extends z.ZodType, O>(t: OpenFlowTool<S, O>): Tool {
  return {
    description: t.description,
    inputSchema: zodSchema(t.inputSchema),
    execute: async (args: z.infer<S>) => await t.execute(args),
  };
}

export function toAiSdkToolDict(tools: Record<string, OpenFlowTool>): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) out[name] = toAiSdkTool(tool);
  return out;
}
