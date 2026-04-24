import type { FormData } from '../../types/forms.js';
import { parsePath } from './parsePath.js';

export type ReadResult = { ok: true; value: unknown } | { ok: false; reason: string };

export function readFormField(data: FormData | undefined, path: string): ReadResult {
  const parsed = parsePath(path);
  if (!parsed.ok) return { ok: false, reason: `Invalid path: ${parsed.error.reason}` };
  if (data === undefined) {
    return { ok: false, reason: 'Field has not been set yet' };
  }

  let cursor: unknown = data;
  for (const seg of parsed.segments) {
    const fieldRead = getFieldFromRecord(cursor, seg.fieldName);
    if (!fieldRead.ok) return fieldRead;
    ({ value: cursor } = fieldRead);
    const indexRead = traverseIndices(cursor, seg.indices);
    if (!indexRead.ok) return indexRead;
    ({ value: cursor } = indexRead);
  }
  if (cursor === undefined) return { ok: false, reason: 'Field has not been set yet' };
  return { ok: true, value: cursor };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getFieldFromRecord(cursor: unknown, fieldName: string): ReadResult {
  if (!isRecord(cursor)) return { ok: false, reason: 'Field has not been set yet' };
  return { ok: true, value: cursor[fieldName] };
}

function traverseIndices(cursor: unknown, indices: Array<number | 'wildcard'>): ReadResult {
  let current = cursor;
  for (const idx of indices) {
    if (idx === 'wildcard') {
      return { ok: false, reason: 'Runtime path cannot contain wildcards' };
    }
    if (!Array.isArray(current)) {
      return { ok: false, reason: 'Field has not been set yet' };
    }
    const { [idx]: value } = current;
    current = value;
  }
  return { ok: true, value: current };
}
