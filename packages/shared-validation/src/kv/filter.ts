// FE-safe filter helpers. Anything that imports the regex engine lives in ./matcher.ts and is
// reached via a subpath export. The engine is re2js, a pure-JS RE2 implementation that is
// ReDoS-safe (linear-time matching) and portable to Workers/Deno (no native binary).

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
