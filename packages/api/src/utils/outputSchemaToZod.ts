import type { OutputSchemaField } from '@daviddh/graph-types';
import { z } from 'zod';

const MIN_ENUM_VALUES = 1;

function fieldToZodType(field: OutputSchemaField): z.ZodType {
  const base = buildBaseType(field);
  return field.required ? base : base.nullable();
}

function buildBaseType(field: OutputSchemaField): z.ZodType {
  switch (field.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      return buildEnumType(field.enumValues);
    case 'object':
      return buildObjectType(field.properties);
    case 'array':
      return buildArrayType(field.items);
  }
}

function buildEnumType(enumValues: string[] | undefined): z.ZodType {
  if (enumValues === undefined || enumValues.length < MIN_ENUM_VALUES) return z.string();
  const [first, ...rest] = enumValues;
  if (first === undefined) return z.string();
  return z.enum([first, ...rest]);
}

function buildObjectType(properties: OutputSchemaField[] | undefined): z.ZodType {
  if (properties === undefined) return z.object({});
  const shape: Record<string, z.ZodType> = {};
  for (const prop of properties) {
    shape[prop.name] = fieldToZodType(prop);
  }
  return z.object(shape);
}

function buildArrayType(items: OutputSchemaField | undefined): z.ZodType {
  if (items === undefined) return z.array(z.unknown());
  return z.array(fieldToZodType(items));
}

/** Convert OutputSchemaField[] to a Zod object schema for structured output. */
export function outputSchemaToZod(fields: OutputSchemaField[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.name] = fieldToZodType(field);
  }
  return z.object(shape);
}
