import RE2 from 're2';

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

function matchSubstring(s: string, query: string, ci: boolean): boolean {
  if (query === '') return true;
  if (ci) return s.toLowerCase().includes(query.toLowerCase());
  return s.includes(query);
}

function applyMatch(entry: KvEntry, on: FilterOn, fn: (s: string) => boolean): boolean {
  if (on === 'keys') return fn(entry.key);
  if (on === 'values') return fn(entry.value);
  return fn(entry.key) || fn(entry.value);
}

export function filterByMatcher<T extends KvEntry>(
  entries: T[],
  on: FilterOn,
  matcher: FilterMatcher
): T[] {
  if (matcher.kind === 'substring') {
    return entries.filter((e) =>
      applyMatch(e, on, (s) => matchSubstring(s, matcher.query, matcher.caseInsensitive))
    );
  }
  const re = new RE2(matcher.pattern, matcher.flags);
  return entries.filter((e) => applyMatch(e, on, (s) => re.test(s)));
}
