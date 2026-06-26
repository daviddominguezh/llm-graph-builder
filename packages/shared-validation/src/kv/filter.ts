// FE-safe filter helpers. Anything that imports RE2 lives in ./matcher.ts and is reached
// via a subpath export so the FE bundle never pulls in the native re2.node binary.

export interface KvEntry {
  key: string;
  value: string;
}

export function filterDefault<T extends KvEntry>(entries: T[], query: string): T[] {
  if (query === '') return entries;
  const needle = query.toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(needle) || e.value.toLowerCase().includes(needle)
  );
}

export type FilterOn = 'keys' | 'values' | 'both';

export type FilterMatcher =
  | { kind: 'substring'; query: string; caseInsensitive: boolean }
  | { kind: 'regex'; pattern: string; flags: string };
