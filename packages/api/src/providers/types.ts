import type { JSONSchema7 } from '@ai-sdk/provider';
import type { Tool } from 'ai';
import { jsonSchema, zodSchema } from 'ai';
import type { z } from 'zod';

/**
 * Raw JSON Schema shape that MCP servers send (Draft-07 subset).
 * Aliased to JSONSchema7 from @ai-sdk/provider so it is directly compatible
 * with the ai SDK's jsonSchema() wrapper without any casting.
 */
export type RawJsonSchema = JSONSchema7;

export type ToolInputSchema = z.ZodType | RawJsonSchema;

/**
 * Project-local tool shape. Decouples Provider implementations from the AI SDK's
 * `Tool` type so AI SDK breaking changes don't cascade across every provider.
 *
 * Built-in providers (calendar/forms/lead_scoring/composition) author tools using
 * Zod schemas — the cleanest DX for our internal tools. MCP tools, by contrast,
 * arrive from the server as raw JSON Schema; passing them through unchanged
 * preserves full schema fidelity for the LLM.
 *
 * Adapter `toAiSdkTool` is the only place that imports from 'ai'.
 */
export interface OpenFlowTool<Output = unknown> {
  description: string;
  inputSchema: ToolInputSchema;
  execute: (args: unknown) => Promise<Output> | Output;
}

function isZodSchema(value: ToolInputSchema): value is z.ZodType {
  // Zod schemas carry an internal `_def` property; plain JSON Schema objects do not.
  // Both union members are object types, so a simple `in` check is sufficient.
  return '_def' in value;
}

export function toAiSdkTool<O>(t: OpenFlowTool<O>): Tool {
  const wrapped = isZodSchema(t.inputSchema) ? zodSchema(t.inputSchema) : jsonSchema(t.inputSchema);
  return {
    description: t.description,
    inputSchema: wrapped,
    execute: async (args: unknown) => await t.execute(args),
  };
}

export function toAiSdkToolDict(tools: Record<string, OpenFlowTool>): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) out[name] = toAiSdkTool(tool);
  return out;
}
