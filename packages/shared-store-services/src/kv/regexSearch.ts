// ReDoS-safe KV regex: re2js gives linear-time matching in Node, Workers, and
// Deno (no native addon). We additionally extract a required literal substring
// so the DB can prefilter with a trigram-indexed ILIKE before re2js runs on the
// (small) candidate set. The regex itself is NEVER sent to Postgres.
import { RE2JS } from 're2js';

import type { KvRow, KvSearchOn } from './kvQueries.js';

const MIN_LITERAL_LEN = 2;
const EMPTY = '';
const ONE = 1;
const TWO = 2;
const ZERO = 0;

export interface CompiledRegex {
  test: (s: string) => boolean;
}

export function compileRegex(pattern: string): CompiledRegex {
  try {
    const compiled = RE2JS.compile(pattern);
    return { test: (s: string): boolean => compiled.test(s) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'syntax error';
    throw new Error(`invalid_pattern: ${detail}`, { cause: err });
  }
}

// Regex metacharacters that, when present, end the current literal run because
// what follows is not a required literal byte. (`[` and `\\` are handled by the
// scanner before this set is consulted, so they need no entry here.)
const META = new Set<string>(['.', '*', '+', '?', '(', ')', ']', '{', '}', '|', '^', '$']);
// A quantifier immediately after a literal char makes THAT char optional/repeated,
// so the char before the quantifier is not guaranteed present.
const QUANTIFIER = new Set<string>(['*', '?', '{']);

function hasAlternation(pattern: string): boolean {
  // A top-level '|' means no single literal is guaranteed; bail conservatively.
  // (Any '|' is treated as disqualifying — sound, not maximally precise.)
  return pattern.includes('|');
}

// Advance past a bracketed character class `[...]`; its interior is a set, not a
// required literal, so nothing inside contributes to a run. Returns the index of
// the closing `]` (or the last index if unterminated).
function skipCharClass(pattern: string, open: number): number {
  let i = open + ONE;
  // A `]` as the very first class member is a literal `]`, not the terminator.
  if (pattern[i] === ']') i += ONE;
  while (i < pattern.length) {
    const ch = pattern[i] ?? EMPTY;
    if (ch === '\\') i += TWO;
    else if (ch === ']') return i;
    else i += ONE;
  }
  return pattern.length - ONE;
}

// Accumulates maximal literal runs while scanning the pattern. Mutating `this`
// keeps the scan loop short and avoids reassigning a passed-in parameter.
class RunAccumulator {
  private readonly runs: string[] = [];
  private current = EMPTY;

  close(): void {
    if (this.current.length > ZERO) this.runs.push(this.current);
    this.current = EMPTY;
  }

  // Add a literal char unless the NEXT char quantifies it (`*`, `?`, `{`), which
  // makes the char optional/repeated and therefore not guaranteed present.
  consume(ch: string, next: string): void {
    if (QUANTIFIER.has(next)) this.close();
    else this.current += ch;
  }

  result(): string[] {
    this.close();
    return this.runs;
  }
}

function literalRuns(pattern: string): string[] {
  const acc = new RunAccumulator();
  for (let i = 0; i < pattern.length; i += ONE) {
    const ch = pattern[i] ?? EMPTY;
    if (ch === '\\') {
      // An escape sequence is not a plain literal byte we can prefilter on; end
      // the current run and skip the escaped char.
      acc.close();
      i += ONE;
    } else if (ch === '[') {
      acc.close();
      i = skipCharClass(pattern, i);
    } else if (META.has(ch)) {
      acc.close();
    } else {
      acc.consume(ch, pattern[i + ONE] ?? EMPTY);
    }
  }
  return acc.result();
}

function longestRun(runs: string[]): string {
  return runs.reduce((longest, r) => (r.length > longest.length ? r : longest), EMPTY);
}

export function extractRequiredLiteral(pattern: string): string | null {
  if (hasAlternation(pattern)) return null;
  const runs = literalRuns(pattern).filter((r) => r.length >= MIN_LITERAL_LEN);
  if (runs.length === ZERO) return null;
  const longest = longestRun(runs);
  return longest.length > ZERO ? longest : null;
}

export function matchEntry(re: CompiledRegex, entry: KvRow, on: KvSearchOn): boolean {
  if (on === 'keys') return re.test(entry.key);
  if (on === 'values') return re.test(entry.value);
  return re.test(entry.key) || re.test(entry.value);
}
