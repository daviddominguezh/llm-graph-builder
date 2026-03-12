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

const MIN_ENUM_VALUES = 1;
const MIN_PROPERTIES = 1;

function isFieldComplete(field: OutputSchemaField, isArrayItem: boolean): boolean {
  if (!isArrayItem && (!field.name || !isValidFieldName(field.name))) return false;
  if (!isArrayItem && (!field.description || field.description.trim() === '')) return false;
  return isFieldTypeComplete(field);
}

function hasUniqueValues(values: string[]): boolean {
  const trimmed = values.map((v) => v.trim());
  return new Set(trimmed).size === trimmed.length;
}

function hasUniqueNames(fields: OutputSchemaField[]): boolean {
  const names = fields.map((f) => f.name);
  return new Set(names).size === names.length;
}

function isFieldTypeComplete(field: OutputSchemaField): boolean {
  if (field.type === 'enum') {
    const values = field.enumValues ?? [];
    return values.length >= MIN_ENUM_VALUES && values.every((v) => v.trim() !== '') && hasUniqueValues(values);
  }
  if (field.type === 'object') {
    const props = field.properties ?? [];
    return props.length >= MIN_PROPERTIES && hasUniqueNames(props) && props.every((p) => isFieldComplete(p, false));
  }
  if (field.type === 'array') {
    return field.items !== undefined && isFieldComplete(field.items, true);
  }
  return true;
}

export function isSchemaComplete(name: string, fields: OutputSchemaField[]): boolean {
  if (!name || name.trim() === '') return false;
  if (fields.length === 0) return false;
  if (!hasUniqueNames(fields)) return false;
  return fields.every((f) => isFieldComplete(f, false));
}
