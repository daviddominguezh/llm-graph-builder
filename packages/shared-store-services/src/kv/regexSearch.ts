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
//
// Group bookkeeping: each `(` pushes the count of already-finalized runs and the
// length of the in-progress run, so a later optional `)` (`?`, `*`, `{0,...}`)
// can discard exactly that group's contribution and break run contiguity, while
// a required group's interior survives as a sound literal.
class RunAccumulator {
  private runs: string[] = [];
  private current = EMPTY;
  private readonly groupStack: GroupMark[] = [];

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

  openGroup(): void {
    // The current run cannot span the `(` boundary: anything before it is fixed,
    // anything inside starts fresh so it can be discarded if the group is optional.
    this.close();
    this.groupStack.push({ runCount: this.runs.length });
  }

  // Called at `)`. When `optional` is true, drop every run finalized since the
  // matching `(` and reset contiguity; otherwise the group's runs stay required.
  closeGroup(optional: boolean): void {
    this.close();
    const mark = this.groupStack.pop();
    if (optional) this.runs = this.runs.slice(ZERO, mark?.runCount ?? this.runs.length);
  }

  result(): string[] {
    this.close();
    return this.runs;
  }
}

interface GroupMark {
  readonly runCount: number;
}

// A `)` is optional (its interior not guaranteed present) when immediately
// followed by `?`, `*`, or a `{0...}`/`{0}` brace range whose MINIMUM repeat is
// zero. `+`, `{1,}`, `{n,...}` (n>=1) or no quantifier keep the group required.
function groupIsOptional(pattern: string, closeIdx: number): boolean {
  const next = pattern[closeIdx + ONE] ?? EMPTY;
  if (next === '?' || next === '*') return true;
  if (next === '{') return braceMinIsZero(pattern, closeIdx + ONE);
  return false;
}

// Read the minimum-repeat field of a `{...}` quantifier opening at `open`.
// Returns true when that minimum is zero (e.g. `{0}`, `{0,3}`).
function braceMinIsZero(pattern: string, open: number): boolean {
  let i = open + ONE;
  let digits = EMPTY;
  while (i < pattern.length) {
    const ch = pattern[i] ?? EMPTY;
    if (ch === ',' || ch === '}') break;
    digits += ch;
    i += ONE;
  }
  return digits.length > ZERO && Number(digits) === ZERO;
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
    } else if (ch === '(') {
      acc.openGroup();
    } else if (ch === ')') {
      acc.closeGroup(groupIsOptional(pattern, i));
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
