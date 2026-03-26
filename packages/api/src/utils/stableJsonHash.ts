function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function sortedObject(val: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(val)
      .sort()
      .map((k) => [k, val[k]])
  );
}

/** JSON.stringify with sorted keys at every nesting level for deterministic output. */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (isPlainObject(val)) {
      return sortedObject(val);
    }
    return val;
  });
}
