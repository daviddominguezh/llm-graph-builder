import type { SelectedTool } from '@daviddh/llm-graph-runner';

import type { Precondition, ToolFieldValue } from '../schemas/graph.schema';

/**
 * Returns the human-readable display value of a precondition. For
 * `tool_call` preconditions this is the tool's `toolName`; for the others
 * it is the literal `value` string.
 */
export function getPreconditionDisplayValue(p: Precondition): string {
  return p.type === 'tool_call' ? p.tool.toolName : p.value;
}

/**
 * Returns the toolFields for a precondition if it is a `tool_call`,
 * otherwise undefined.
 */
export function getPreconditionToolFields(p: Precondition): Record<string, ToolFieldValue> | undefined {
  return p.type === 'tool_call' ? p.toolFields : undefined;
}

interface MakePreconditionInput {
  // tool_call goes through makeToolCallPrecondition — not allowed here
  type: 'user_said' | 'agent_decision';
  value: string;
  description?: string;
}

/**
 * Constructs a non-tool_call Precondition from a flat input shape.
 * For tool_call preconditions use makeToolCallPrecondition instead.
 */
export function makePrecondition(input: MakePreconditionInput): Precondition {
  return {
    type: input.type,
    value: input.value,
    description: input.description,
  };
}

export interface MakeToolCallInput {
  tool: SelectedTool;
  description?: string;
  toolFields?: Record<string, ToolFieldValue>;
}

/**
 * Constructs a tool_call Precondition from a SelectedTool ref.
 * Use this instead of makePrecondition for tool_call preconditions so that
 * the correct providerType/providerId are preserved.
 */
export function makeToolCallPrecondition(input: MakeToolCallInput): Precondition {
  return {
    type: 'tool_call',
    tool: input.tool,
    description: input.description,
    toolFields: input.toolFields,
  };
}
