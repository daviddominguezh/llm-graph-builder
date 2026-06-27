// Regex matching for KV filters. Uses re2js (pure-JS, linear-time) so it runs
// anywhere — Node, Workers, Deno — with no native addon. Still reached via the
// `./kv/matcher` subpath export so re2js stays out of the FE bundle unless a
// caller actually needs regex matching; FE-safe helpers live in ./filter.ts.

import { RE2JS } from 're2js';

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

const NO_FLAGS = 0;

// Map the legacy flag string to re2js bitwise flags. Only `i` (case-insensitive)
// is meaningful for substring presence matching; other native-re2 flags had no
// effect on `.test()` and are ignored.
function compileFlags(flags: string): number {
  return flags.includes('i') ? RE2JS.CASE_INSENSITIVE : NO_FLAGS;
}

// Compile a regex matcher, surfacing a clean error instead of leaking re2js's
// RE2JSSyntaxException type to callers.
function compileMatcher(pattern: string, flags: string): RE2JS {
  try {
    return RE2JS.compile(pattern, compileFlags(flags));
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'syntax error';
    throw new Error(`invalid regex: ${detail}`, { cause: err });
  }
}

export function filterByMatcher<T extends KvEntry>(entries: T[], on: FilterOn, matcher: FilterMatcher): T[] {
  if (matcher.kind === 'substring') {
    return entries.filter((e) =>
      applyMatch(e, on, (s) => matchSubstring(s, matcher.query, matcher.caseInsensitive))
    );
  }
  const re = compileMatcher(matcher.pattern, matcher.flags);
  return entries.filter((e) => applyMatch(e, on, (s) => re.test(s)));
}
