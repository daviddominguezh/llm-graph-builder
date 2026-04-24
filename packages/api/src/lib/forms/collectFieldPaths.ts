import type { OutputSchemaField } from '@daviddh/graph-types';

export type SimpleLeafType = 'string' | 'number';
export interface SimpleLeaf {
  path: string;
  type: SimpleLeafType;
}

export function collectFieldPaths(fields: OutputSchemaField[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    walkLeaves(f, f.name, (p) => out.push(p), null);
  }
  return out;
}

export function collectSimpleLeafPaths(fields: OutputSchemaField[]): SimpleLeaf[] {
  const out: SimpleLeaf[] = [];
  for (const f of fields) {
    walkLeaves(
      f,
      f.name,
      () => undefined,
      (p, t) => out.push({ path: p, type: t })
    );
  }
  return out;
}

type LeafCb = (path: string) => void;
type TypedLeafCb = ((path: string, type: SimpleLeafType) => void) | null;

function isObjectWithProperties(field: OutputSchemaField): field is OutputSchemaField & { properties: OutputSchemaField[] } {
  return field.type === 'object' && field.properties !== undefined;
}

function isArrayWithItems(field: OutputSchemaField): field is OutputSchemaField & { items: OutputSchemaField } {
  return field.type === 'array' && field.items !== undefined;
}

function isSimpleLeaf(field: OutputSchemaField): field is OutputSchemaField & { type: SimpleLeafType } {
  return field.type === 'string' || field.type === 'number';
}

function walkLeaves(field: OutputSchemaField, path: string, onLeaf: LeafCb, onTyped: TypedLeafCb): void {
  if (isObjectWithProperties(field)) {
    for (const p of field.properties) {
      walkLeaves(p, `${path}.${p.name}`, onLeaf, onTyped);
    }
    return;
  }
  if (isArrayWithItems(field)) {
    walkLeaves(field.items, `${path}[]`, onLeaf, onTyped);
    return;
  }
  onLeaf(path);
  if (onTyped !== null && isSimpleLeaf(field)) {
    onTyped(path, field.type);
  }
}
