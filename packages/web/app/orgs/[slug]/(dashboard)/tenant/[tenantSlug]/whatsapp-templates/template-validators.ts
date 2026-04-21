const FIRST_PLACEHOLDER = 1;
const INDEX_STEP = 1;

const PLACEHOLDER_TAG = /\{\{(?:[^\}]+)\}\}/gv;
const NUMERIC_ONLY = /^\d+$/v;
const BRACE_STRIP = /\{\{|\}\}/gv;

/**
 * Validate body placeholders are numeric and consecutive starting at 1.
 * Duplicates allowed. Returns an error string or null when valid.
 */
export function validateBodyPlaceholders(bodyText: string): string | null {
  const placeholders = bodyText.match(PLACEHOLDER_TAG);
  if (placeholders === null) return null;

  const keys = placeholders.map((placeholder) => placeholder.replace(BRACE_STRIP, '').trim());

  for (const key of keys) {
    if (!NUMERIC_ONLY.test(key)) {
      return `Placeholder {{${key}}} must be a number (e.g. {{1}}, {{2}})`;
    }
  }

  const uniqueNumbers = [...new Set(keys.map(Number))].sort((a, b) => a - b);

  for (let i = 0; i < uniqueNumbers.length; i += INDEX_STEP) {
    const expected = i + FIRST_PLACEHOLDER;
    if (uniqueNumbers[i] !== expected) {
      return `Placeholders must be consecutive starting from 1. Found {{${String(uniqueNumbers[i])}}} but missing {{${String(expected)}}}`;
    }
  }

  return null;
}
