import type { FormData, PathSegment } from '../../types/forms.js';
import { parsePath } from './parsePath.js';

const ZERO = 0;
const ONE = 1;

export type SetResult = { ok: true } | { ok: false; reason: string };

export function setAtPath(rootIn: FormData, path: string, value: unknown): SetResult {
  const root = rootIn;
  const p = parsePath(path);
  if (!p.ok) return { ok: false, reason: p.error.reason };
  return walkAndSet(root, p.segments, value);
}

function walkAndSet(rootIn: FormData, segments: PathSegment[], value: unknown): SetResult {
  const root = rootIn;
  let parent: Container = root;
  for (const [i, seg] of segments.entries()) {
    const isLastSegment = i === segments.length - ONE;
    const r = stepInto(parent, seg, { isLastSegment, value });
    if (!r.ok) return r;
    if (r.done) return { ok: true };
    const { next } = r;
    parent = next;
  }
  return { ok: true };
}

type Container = Record<string, unknown> | unknown[];

interface StepDone {
  ok: true;
  done: true;
}
interface StepContinue {
  ok: true;
  done: false;
  next: Container;
}
type StepResult = StepDone | StepContinue | { ok: false; reason: string };

interface StepCtx {
  isLastSegment: boolean;
  value: unknown;
}

function stepInto(parentIn: Container, seg: PathSegment, ctx: StepCtx): StepResult {
  const parent = parentIn;
  const kind: 'array' | 'object' = seg.indices.length > ZERO ? 'array' : 'object';
  const container = getOrCreate(parent, seg.fieldName, kind);
  if (!container.ok) return container;
  if (ctx.isLastSegment && seg.indices.length === ZERO) {
    return assignField(parent, seg.fieldName, ctx.value);
  }
  return descendIndices(container.value, seg.indices, ctx);
}

function assignField(parentIn: Container, fieldName: string, value: unknown): StepResult {
  if (Array.isArray(parentIn)) return { ok: false, reason: 'Cannot assign field on array parent' };
  const parent = parentIn;
  parent[fieldName] = value;
  return { ok: true, done: true };
}

function descendIndices(startIn: Container, indices: PathSegment['indices'], ctx: StepCtx): StepResult {
  let ptr: Container = startIn;
  for (const [k, idx] of indices.entries()) {
    const isLastIdx = k === indices.length - ONE;
    const stepped = stepIndex(ptr, idx, { ...ctx, isLastIdx });
    if (!stepped.ok) return stepped;
    if (stepped.done) return { ok: true, done: true };
    const { next } = stepped;
    ptr = next;
  }
  return { ok: true, done: false, next: ptr };
}

interface IndexCtx extends StepCtx {
  isLastIdx: boolean;
}
type IndexStep = StepDone | { ok: true; done: false; next: Container } | { ok: false; reason: string };

function stepIndex(ptrIn: Container, idx: number | 'wildcard', ctx: IndexCtx): IndexStep {
  if (idx === 'wildcard') return { ok: false, reason: 'Runtime path cannot contain wildcards' };
  if (!Array.isArray(ptrIn)) return { ok: false, reason: 'Expected array at index position' };
  const arr = ptrIn;
  const mustSetValueHere = ctx.isLastSegment && ctx.isLastIdx;
  if (mustSetValueHere) {
    const { value } = ctx;
    arr[idx] = value;
    return { ok: true, done: true };
  }
  return ensureSlot(arr, idx);
}

function ensureSlot(arrIn: unknown[], idx: number): IndexStep {
  const arr = arrIn;
  if (arr[idx] === undefined) arr[idx] = {};
  const { [idx]: next } = arr;
  if (!isObjectOrArray(next)) return { ok: false, reason: 'Expected object/array at path' };
  return { ok: true, done: false, next };
}

type GetOrCreateResult = { ok: true; value: Container } | { ok: false; reason: string };

function getOrCreate(parentIn: Container, key: string, kind: 'array' | 'object'): GetOrCreateResult {
  if (Array.isArray(parentIn)) return { ok: false, reason: 'Cannot use field name on array parent' };
  const parent = parentIn;
  if (parent[key] === undefined) {
    parent[key] = kind === 'array' ? [] : {};
  }
  const { [key]: existing } = parent;
  return validateExistingShape(existing, kind);
}

function validateExistingShape(existing: unknown, kind: 'array' | 'object'): GetOrCreateResult {
  if (kind === 'array') {
    if (!Array.isArray(existing)) return { ok: false, reason: 'Existing value is not an array' };
    return { ok: true, value: existing };
  }
  if (!isPlainObject(existing)) return { ok: false, reason: 'Existing value is not an object' };
  return { ok: true, value: existing };
}

function isObjectOrArray(v: unknown): v is Container {
  return typeof v === 'object' && v !== null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
