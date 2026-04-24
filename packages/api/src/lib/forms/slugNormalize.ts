const MAX_LEN = 64;
const SLICE_START = 0;
const NEXT_OFFSET = 1;

export function slugNormalize(input: string): string {
  const lower = input.toLowerCase();
  const hyphenated = lower.replace(/[\s_]+/gv, '-');
  const stripped = hyphenated.replace(/[^a-z0-9\-]/gv, '');
  const collapsed = stripped.replace(/-+/gv, '-');
  const trimmed = collapsed.replace(/^-+|-+$/gv, '');

  // Truncate to max length, accounting for trailing hyphens
  const truncated = trimmed.slice(SLICE_START, MAX_LEN);

  if (!truncated.endsWith('-')) {
    return truncated;
  }

  return refillTrailingHyphens(truncated, trimmed);
}

function refillTrailingHyphens(truncated: string, source: string): string {
  let result = truncated.replace(/-+$/gv, '');
  let { length: pos } = result;
  while (result.length < MAX_LEN && pos < source.length) {
    result = appendIfNotHyphen(result, source, pos);
    pos += NEXT_OFFSET;
  }
  return result;
}

function appendIfNotHyphen(result: string, source: string, pos: number): string {
  const { [pos]: char } = source;
  if (char === undefined || char === '-') {
    return result;
  }
  return result + char;
}
