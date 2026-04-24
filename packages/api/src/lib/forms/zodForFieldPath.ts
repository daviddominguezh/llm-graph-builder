import type { OutputSchemaField } from '@daviddh/graph-types';
import { type ZodType, z } from 'zod';

import type { PathSegment } from '@src/types/forms.js';

import { parsePath } from './parsePath.js';

const MIN_ENUM_LENGTH = 1;
const FIRST_INDEX = 0;

export type ZodLookup =
  | { ok: true; zod: ZodType; expectedType: string }
  | { ok: false; reason: 'path-not-found' | 'parse-error'; detail?: string };

export function zodForFieldPath(fields: OutputSchemaField[], path: string): ZodLookup {
  const parsed = parsePath(path);
  if (!parsed.ok) {
    return { ok: false, reason: 'parse-error', detail: parsed.error.reason };
  }
  const field = resolve(fields, parsed.segments);
  if (field === undefined) {
    return { ok: false, reason: 'path-not-found' };
  }
  return { ok: true, zod: toZod(field), expectedType: describe(field) };
}

function resolve(fields: OutputSchemaField[], segs: PathSegment[]): OutputSchemaField | undefined {
  let pool: OutputSchemaField[] | undefined = fields;
  let current: OutputSchemaField | undefined = undefined;

  for (const seg of segs) {
    if (pool === undefined) {
      return undefined;
    }

    const { fieldName, indices } = seg;
    current = pool.find((f) => f.name === fieldName);
    if (current === undefined) {
      return undefined;
    }

    const field = walkArrayIndices(current, indices);
    if (field === undefined) {
      return undefined;
    }

    pool = field.type === 'object' ? field.properties : undefined;
  }

  return current;
}

function walkArrayIndices(
  field: OutputSchemaField,
  indices: Array<number | 'wildcard'>
): OutputSchemaField | undefined {
  let current = field;
  for (const index of indices) {
    if (typeof index !== 'number') {
      return undefined;
    }
    const { type, items } = current;
    if (type !== 'array' || items === undefined) {
      return undefined;
    }
    current = items;
  }
  return current;
}

function toZod(field: OutputSchemaField): ZodType {
  const { type } = field;
  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      return buildEnumZod(field);
    case 'array': {
      const itemSchema = field.items === undefined ? z.unknown() : toZod(field.items);
      return z.array(itemSchema);
    }
    case 'object':
      return buildObjectZod(field.properties ?? []);
  }
}

function buildEnumZod(field: OutputSchemaField & { type: 'enum' }): ZodType {
  const { enumValues } = field;
  const enumVals = enumValues ?? [];
  if (enumVals.length < MIN_ENUM_LENGTH) {
    return z.string();
  }
  const first = enumVals[FIRST_INDEX];
  if (first === undefined) {
    return z.string();
  }
  const remainingVals = enumVals.slice(MIN_ENUM_LENGTH);
  if (remainingVals.length > FIRST_INDEX) {
    return z.enum([first, ...remainingVals] as [string, ...string[]]);
  }
  return z.literal(first);
}

function buildObjectZod(properties: OutputSchemaField[]): ZodType {
  const shape: Record<string, ZodType> = {};
  for (const prop of properties) {
    shape[prop.name] = toZod(prop);
  }
  return z.object(shape);
}

function describe(field: OutputSchemaField): string {
  const { type } = field;
  if (type === 'enum') {
    const enumVals = field.enumValues ?? [];
    return `enum(${enumVals.join('|')})`;
  }
  if (type === 'array') {
    const { items } = field;
    if (items !== undefined) {
      return `array of ${describe(items)}`;
    }
    return 'array';
  }
  return type;
}
