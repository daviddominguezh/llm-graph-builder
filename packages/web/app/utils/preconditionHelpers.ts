import type { Precondition, PreconditionType, ToolFieldValue } from '../schemas/graph.schema';

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
export function getPreconditionToolFields(
  p: Precondition
): Record<string, ToolFieldValue> | undefined {
  return p.type === 'tool_call' ? p.toolFields : undefined;
}

interface MakePreconditionInput {
  type: PreconditionType;
  value: string;
  description?: string;
  toolFields?: Record<string, ToolFieldValue>;
}

const DEFAULT_BUILTIN_PROVIDER_ID = 'calendar';

/**
 * Constructs a Precondition from a flat `{ type, value, description }` shape
 * (the form used by panel UIs). For `tool_call`, the `value` is interpreted
 * as a tool name and wrapped into a `SelectedTool` ref defaulting to the
 * built-in `calendar` provider. Callers that know the correct provider should
 * construct the precondition directly.
 */
export function makePrecondition(input: MakePreconditionInput): Precondition {
  if (input.type === 'tool_call') {
    return {
      type: 'tool_call',
      tool: {
        providerType: 'builtin',
        providerId: DEFAULT_BUILTIN_PROVIDER_ID,
        toolName: input.value,
      },
      description: input.description,
      toolFields: input.toolFields,
    };
  }
  return {
    type: input.type,
    value: input.value,
    description: input.description,
  };
}
