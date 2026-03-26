import type { ToolFieldValue } from '@src/types/graph.js';
import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

const EMPTY = 0;
const SINGLE = 1;

interface SingleResolution {
  kind: 'single';
  value: unknown;
}

interface MultipleResolution {
  kind: 'multiple';
  values: unknown[];
}

type Resolution = SingleResolution | MultipleResolution;

export function resolveReferenceValue(
  field: ToolFieldValue,
  structuredOutputs: Record<string, unknown[]>
): Resolution | null {
  if (field.type === 'fixed') return { kind: 'single', value: field.value };
  return resolveReference(field, structuredOutputs);
}

function resolveReference(
  field: Extract<ToolFieldValue, { type: 'reference' }>,
  outputs: Record<string, unknown[]>
): Resolution | null {
  const { [field.nodeId]: entries } = outputs;
  if (entries === undefined || entries.length === EMPTY) {
    return tryFallbacks(field.fallbacks, outputs);
  }

  const values = extractAndDeduplicate(entries, field.path);
  if (values.length === EMPTY) return tryFallbacks(field.fallbacks, outputs);
  if (values.length === SINGLE) return { kind: 'single', value: values[EMPTY] };
  return { kind: 'multiple', values };
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function extractAndDeduplicate(entries: unknown[], path: string): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const entry of entries) {
    if (!isPlainRecord(entry)) continue;
    const { [path]: val } = entry;
    if (val === null || val === undefined) continue;
    const hash = stableJsonStringify(val);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(val);
    }
  }
  return result;
}

function tryFallbacks(
  fallbacks: ToolFieldValue[] | undefined,
  outputs: Record<string, unknown[]>
): Resolution | null {
  if (fallbacks === undefined) return null;
  for (const fb of fallbacks) {
    const result = resolveReferenceValue(fb, outputs);
    if (result !== null) return result;
  }
  return null;
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
}

function buildSingleLines(
  toolFields: Record<string, ToolFieldValue>,
  outputs: Record<string, unknown[]>
): string[] {
  const lines: string[] = [];
  for (const [name, field] of Object.entries(toolFields)) {
    if (field.type === 'fixed') {
      lines.push(`- ${name}: "${field.value}"`);
      continue;
    }
    const resolution = resolveReferenceValue(field, outputs);
    if (resolution !== null && resolution.kind === 'single') {
      lines.push(`- ${name}: ${formatValue(resolution.value)}`);
    }
  }
  return lines;
}

function buildMultiLines(
  toolFields: Record<string, ToolFieldValue>,
  outputs: Record<string, unknown[]>
): string[] {
  const lines: string[] = [];
  for (const [name, field] of Object.entries(toolFields)) {
    if (field.type === 'fixed') continue;
    const resolution = resolveReferenceValue(field, outputs);
    if (resolution !== null && resolution.kind === 'multiple') {
      lines.push(`- ${name}: one of [${resolution.values.map(formatValue).join(', ')}]`);
    }
  }
  return lines;
}

const SINGLE_PROMPT_HEADER = '\n\nFor the following parameters, use these EXACT values:';

const MULTI_PROMPT_HEADER =
  '\n\nFor the following parameters, multiple values are available from different executions. Choose the most appropriate based on context:';

export function buildResolvedFieldsPrompt(
  toolFields: Record<string, ToolFieldValue>,
  structuredOutputs: Record<string, unknown[]>
): string {
  const singleLines = buildSingleLines(toolFields, structuredOutputs);
  const multiLines = buildMultiLines(toolFields, structuredOutputs);

  const parts: string[] = [];
  if (singleLines.length > EMPTY) {
    parts.push(`${SINGLE_PROMPT_HEADER}\n${singleLines.join('\n')}`);
  }
  if (multiLines.length > EMPTY) {
    parts.push(`${MULTI_PROMPT_HEADER}\n${multiLines.join('\n')}`);
  }
  return parts.join('');
}
