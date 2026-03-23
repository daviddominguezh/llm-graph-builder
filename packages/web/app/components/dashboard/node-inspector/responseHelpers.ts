interface ToolCallEntry {
  name: string;
  args: unknown;
  result: unknown;
}

interface ParsedResponse {
  hasToolCalls: boolean;
  toolCalls: ToolCallEntry[];
  toolCallArgs: ToolCallEntry[];
  toolCallOutputs: ToolCallEntry[];
  structuredOutput: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

export function parseResponse(response: unknown): ParsedResponse {
  const rec = asRecord(response);
  const rawToolCalls =
    rec !== null && Array.isArray(rec['tool_calls']) ? (rec['tool_calls'] as ToolCallEntry[]) : [];
  const hasToolCalls = rawToolCalls.length > 0;

  const toolCallArgs = rawToolCalls.map((tc) => ({
    name: tc.name,
    args: tc.args,
    result: undefined as unknown,
  }));
  const toolCallOutputs = rawToolCalls.map((tc) => ({
    name: tc.name,
    args: undefined as unknown,
    result: tc.result,
  }));

  const structuredOutput = rec !== null && 'structured_output' in rec ? rec['structured_output'] : null;

  return { hasToolCalls, toolCalls: rawToolCalls, toolCallArgs, toolCallOutputs, structuredOutput };
}
