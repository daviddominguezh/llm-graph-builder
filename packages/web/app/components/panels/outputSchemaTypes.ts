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
