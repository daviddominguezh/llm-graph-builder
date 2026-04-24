import type { PathSegment } from '../../types/forms.js';

export type ParseResult =
  | { ok: true; segments: PathSegment[] }
  | { ok: false; error: { reason: string; at: number } };

const FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/v;
const INDEX_RE = /^[0-9]+$/v;
const DOT = '.';
const BRACKET_OPEN = '[';
const BRACKET_CLOSE = ']';
const MIN_PATH_LENGTH = 1;
const INDEX_NOT_FOUND = -1;
const DOT_OFFSET = 1;
const BASE_TEN = 10;
const START_POSITION = 0;

export function parsePath(input: string): ParseResult {
  if (input.length < MIN_PATH_LENGTH) {
    return fail('Empty path', START_POSITION);
  }
  const rawSegments = input.split(DOT);
  const segments: PathSegment[] = [];
  let cursor = START_POSITION;
  for (const raw of rawSegments) {
    if (raw.length < MIN_PATH_LENGTH) {
      return fail('Empty segment', cursor);
    }
    const r = parseSegment(raw, cursor);
    if (!r.ok) {
      return r;
    }
    segments.push(r.segment);
    cursor += raw.length + DOT_OFFSET;
  }
  return { ok: true, segments };
}

type SegmentResult = { ok: true; segment: PathSegment } | Extract<ParseResult, { ok: false }>;

function parseSegment(raw: string, base: number): SegmentResult {
  const bracketIndex = raw.indexOf(BRACKET_OPEN);
  const hasBracket = bracketIndex !== INDEX_NOT_FOUND;
  const name = hasBracket ? raw.slice(START_POSITION, bracketIndex) : raw;
  if (!FIELD_RE.test(name)) {
    return fail(`Invalid field name "${name}"`, base);
  }
  const emptyString = '';
  const indicesPart = hasBracket ? raw.slice(bracketIndex) : emptyString;
  const bracketOffset = hasBracket ? bracketIndex : START_POSITION;
  const idx = parseIndices(indicesPart, base + bracketOffset);
  if (!idx.ok) {
    return idx;
  }
  return { ok: true, segment: { fieldName: name, indices: idx.list } };
}

type IdxResult = { ok: true; list: Array<number | 'wildcard'> } | Extract<ParseResult, { ok: false }>;

function parseIndices(s: string, cursor: number): IdxResult {
  const list: Array<number | 'wildcard'> = [];
  let i = START_POSITION;
  while (i < s.length) {
    if (s[i] !== BRACKET_OPEN) {
      return fail(`Expected '[' at ${String(cursor + i)}`, cursor + i);
    }
    const closeIndex = s.indexOf(BRACKET_CLOSE, i);
    if (closeIndex === INDEX_NOT_FOUND) {
      return fail('Unclosed bracket', cursor + i);
    }
    const tok = s.slice(i + DOT_OFFSET, closeIndex);
    const indexProcessingResult = processIndex(tok, cursor, i, list);
    if (!indexProcessingResult.ok) {
      return indexProcessingResult;
    }
    i = closeIndex + DOT_OFFSET;
  }
  return { ok: true, list };
}

type IndexProcessingResult = { ok: true } | Extract<ParseResult, { ok: false }>;

function processIndex(
  tok: string,
  cursor: number,
  i: number,
  list: Array<number | 'wildcard'>
): IndexProcessingResult {
  if (tok === '') {
    list.push('wildcard');
    return { ok: true };
  }
  if (!INDEX_RE.test(tok)) {
    return fail(`Invalid index "${tok}"`, cursor + i + DOT_OFFSET);
  }
  const parsed = parseInt(tok, BASE_TEN);
  if (parsed < START_POSITION) {
    return fail(`Negative index "${tok}"`, cursor + i + DOT_OFFSET);
  }
  list.push(parsed);
  return { ok: true };
}

function fail(reason: string, at: number): Extract<ParseResult, { ok: false }> {
  return { ok: false, error: { reason, at } };
}
