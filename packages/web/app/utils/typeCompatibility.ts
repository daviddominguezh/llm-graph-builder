import type { OutputSchemaField } from '@daviddh/graph-types';

/** Represents a JSON Schema property from a tool's inputSchema. */
export interface ToolInputProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, ToolInputProperty>;
  items?: ToolInputProperty;
}

type FieldType = OutputSchemaField['type'];

const JSON_SCHEMA_TO_FIELD_TYPE: Record<string, FieldType | undefined> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
};

function resolveTargetType(prop: ToolInputProperty): FieldType | null {
  if (prop.type === undefined) return null;
  if (prop.enum !== undefined && prop.enum.length > 0) return 'enum';
  return JSON_SCHEMA_TO_FIELD_TYPE[prop.type] ?? null;
}

function isEnumSubset(source: string[], target: string[]): boolean {
  const targetSet = new Set(target);
  return source.every((v) => targetSet.has(v));
}

function checkArrayCompat(source: OutputSchemaField, target: ToolInputProperty): boolean {
  if (source.items === undefined || target.items === undefined) return true;
  const sourceItemType = source.items.type;
  const targetItemType = resolveTargetType(target.items);
  if (targetItemType === null) return false;
  return sourceItemType === targetItemType;
}

function checkEnumCompat(source: OutputSchemaField, target: ToolInputProperty): boolean {
  const sourceVals = source.enumValues ?? [];
  const targetVals = target.enum ?? [];
  if (targetVals.length === 0) return true;
  return isEnumSubset(sourceVals, targetVals);
}

/** Check if source output field is type-compatible with target tool input. */
export function isTypeCompatible(source: OutputSchemaField, target: ToolInputProperty): boolean {
  const sourceType = source.type;
  const targetType = resolveTargetType(target);
  if (targetType === null) return false;

  if (sourceType === targetType) {
    if (sourceType === 'enum') return checkEnumCompat(source, target);
    if (sourceType === 'array') return checkArrayCompat(source, target);
    return true;
  }

  // enum → string is always safe
  if (sourceType === 'enum' && targetType === 'string') return true;

  return false;
}

/** Filter output schema fields to those compatible with a target tool input property. */
export function getCompatibleFields(
  fields: OutputSchemaField[],
  target: ToolInputProperty
): OutputSchemaField[] {
  return fields.filter((f) => isTypeCompatible(f, target));
}
