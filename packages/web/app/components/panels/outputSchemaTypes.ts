import type { OutputSchemaField } from '@daviddh/graph-types';

export type OutputSchemaFieldType = OutputSchemaField['type'];

export const FIELD_TYPES: OutputSchemaFieldType[] = [
  'string',
  'number',
  'boolean',
  'enum',
  'object',
  'array',
];

export const MAX_DEPTH = 3;

export const TYPE_BORDER_COLORS: Record<OutputSchemaFieldType, string> = {
  string: 'border-l-zinc-300',
  number: 'border-l-blue-400',
  boolean: 'border-l-green-400',
  enum: 'border-l-amber-400',
  object: 'border-l-purple-400',
  array: 'border-l-orange-400',
};

export const TYPE_BG_COLORS: Record<OutputSchemaFieldType, string> = {
  string: '',
  number: '',
  boolean: '',
  enum: '',
  object: 'bg-purple-50/30 dark:bg-purple-950/20',
  array: 'bg-orange-50/30 dark:bg-orange-950/20',
};

const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidFieldName(name: string): boolean {
  return FIELD_NAME_REGEX.test(name);
}

export function createEmptyField(): OutputSchemaField {
  return { name: '', type: 'string', required: true };
}

export function getAvailableTypes(depth: number): OutputSchemaFieldType[] {
  if (depth >= MAX_DEPTH) {
    return FIELD_TYPES.filter((t) => t !== 'object' && t !== 'array');
  }
  return FIELD_TYPES;
}

export function hasDuplicateName(fields: OutputSchemaField[], name: string, excludeIndex: number): boolean {
  return fields.some((f, i) => i !== excludeIndex && f.name === name);
}

export function updateFieldInList(
  fields: OutputSchemaField[],
  index: number,
  updates: Partial<OutputSchemaField>
): OutputSchemaField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
}

export function removeFieldFromList(fields: OutputSchemaField[], index: number): OutputSchemaField[] {
  return fields.filter((_, i) => i !== index);
}
