import type { Tool as AiSdkTool } from 'ai';
import { z } from 'zod';

import type { ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = { type: 'object', properties: {} };

/**
 * Adapt an AI-SDK Tool to OpenFlowTool.
 *
 * Why we cannot pass `tool.inputSchema` straight through:
 * `OpenFlowTool.inputSchema` is constrained to `z.ZodType`, while AI-SDK's
 * `Tool.inputSchema` is the wider `FlexibleSchema` union (Zod schema, opaque
 * `Schema<>` wrapper, lazy schema, etc.). For MCP the runtime value is
 * usually a `Schema<>` wrapper that already exposes a `jsonSchema` field;
 * the LLM-facing JSON Schema is surfaced via `describeAiSdkTool` (used by
 * `Provider.describeTools`) and not re-derived here.
 *
 * We attach a permissive `z.unknown()` Zod schema purely to satisfy the
 * OpenFlowTool contract; downstream `toAiSdkTool` will turn it back into a
 * Schema, but tool execution forwards the raw input to the original AI-SDK
 * tool's `execute`, so MCP semantics are preserved end-to-end.
 */
export function aiSdkToolToOpenFlowTool(tool: AiSdkTool): OpenFlowTool {
  const { execute: innerExecute } = tool;
  return {
    description: tool.description ?? '',
    inputSchema: z.unknown(),
    execute: async (input: unknown): Promise<unknown> => {
      if (innerExecute === undefined) {
        throw new Error('AI-SDK tool has no execute function');
      }
      return await runInnerExecute(innerExecute, input);
    },
  };
}

/**
 * Bridge between OpenFlowTool's `(input)` execute shape and AI-SDK Tool's
 * `(input, ToolExecutionOptions)` shape. We supply a stub options object so
 * tools that read `toolCallId`/`messages` don't crash; tools that ignore
 * options work unchanged.
 */
async function runInnerExecute(execute: NonNullable<AiSdkTool['execute']>, input: unknown): Promise<unknown> {
  const stubOptions = { toolCallId: 'mcp-adapter', messages: [] };
  const result: unknown = await Promise.resolve(execute(input, stubOptions));
  return result;
}

export function filterToolsByNames(
  all: Record<string, AiSdkTool>,
  names: string[]
): Record<string, OpenFlowTool> {
  const out: Record<string, OpenFlowTool> = {};
  for (const name of names) {
    const { [name]: tool } = all;
    if (tool === undefined) continue;
    out[name] = aiSdkToolToOpenFlowTool(tool);
  }
  return out;
}

function hasJsonSchemaField(value: unknown): value is { jsonSchema: Record<string, unknown> } {
  if (typeof value !== 'object' || value === null) return false;
  if (!('jsonSchema' in value)) return false;
  const { jsonSchema: candidate } = value;
  return typeof candidate === 'object' && candidate !== null;
}

/**
 * Extract a JSON-Schema-shaped descriptor from an AI-SDK Tool. Schema<>
 * wrappers (and the MCP SDK's tool factory) expose a `jsonSchema` field for
 * serialization; if absent, fall back to the empty-object schema.
 */
export function describeAiSdkTool(name: string, tool: AiSdkTool): ToolDescriptor {
  const schema = hasJsonSchemaField(tool.inputSchema) ? tool.inputSchema.jsonSchema : EMPTY_OBJECT_SCHEMA;
  return {
    toolName: name,
    description: tool.description ?? '',
    inputSchema: schema,
  };
}

export function describeAllAiSdkTools(all: Record<string, AiSdkTool>): ToolDescriptor[] {
  return Object.entries(all).map(([name, t]) => describeAiSdkTool(name, t));
}
