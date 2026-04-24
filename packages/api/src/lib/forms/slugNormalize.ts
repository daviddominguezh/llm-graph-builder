const MAX_LEN = 64;

export function slugNormalize(input: string): string {
  const lower = input.toLowerCase();
  const hyphenated = lower.replace(/[\s_]+/g, '-');
  const stripped = hyphenated.replace(/[^a-z0-9-]/g, '');
  const collapsed = stripped.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');

  // Truncate to max length, accounting for trailing hyphens
  let result = trimmed.slice(0, MAX_LEN);

  // If we end with hyphen(s), remove them and try to fill back to MAX_LEN with following non-hyphen chars
  if (result.endsWith('-')) {
    result = result.replace(/-+$/, '');
    let pos = result.length;
    while (result.length < MAX_LEN && pos < trimmed.length) {
      const char = trimmed[pos];
      if (char !== '-') {
        result += char;
      }
      pos += 1;
    }
  }

  return result;
}
