import type { FormData } from '../../types/forms.js';
import { parsePath } from './parsePath.js';

export type ReadResult = { ok: true; value: unknown } | { ok: false; reason: string };

export function readFormField(data: FormData | undefined, path: string): ReadResult {
  const { ok, error, segments } = parsePath(path);
  if (!ok) return { ok: false, reason: `Invalid path: ${error.reason}` };
  if (data === undefined) {
    return { ok: false, reason: 'Field has not been set yet' };
  }

  let cursor: unknown = data;
  for (const seg of segments) {
    const { ok: fieldOk, value: fieldValue } = getFieldFromRecord(cursor, seg.fieldName);
    if (!fieldOk) return { ok: false, reason: 'Field has not been set yet' };
    cursor = fieldValue;
    const { ok: arrayOk, value: arrayValue } = traverseIndices(cursor, seg.indices);
    if (!arrayOk) return { ok: false, reason: 'Field has not been set yet' };
    cursor = arrayValue;
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
