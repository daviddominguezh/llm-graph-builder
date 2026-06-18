// Backend-only. Uses re2 (a native Node addon) which webpack cannot bundle for the FE.
// FE callers must never import this file; use ./filter.ts (re-exported from the package
// barrel) for FE-safe helpers.

import RE2 from 're2';

import type { FilterMatcher, FilterOn, KvEntry } from './filter.js';

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

export function filterByMatcher<T extends KvEntry>(entries: T[], on: FilterOn, matcher: FilterMatcher): T[] {
  if (matcher.kind === 'substring') {
    return entries.filter((e) =>
      applyMatch(e, on, (s) => matchSubstring(s, matcher.query, matcher.caseInsensitive))
    );
  }
  const re = new RE2(matcher.pattern, matcher.flags);
  return entries.filter((e) => applyMatch(e, on, (s) => re.test(s)));
}
