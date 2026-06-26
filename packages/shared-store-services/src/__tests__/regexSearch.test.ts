import { compileRegex, extractRequiredLiteral, matchEntry } from '../kv/regexSearch.js';

const REDOS_INPUT_LEN = 40;
const REDOS_BUDGET_MS = 1000;

describe('re2js regex engine', () => {
  it('compiles and matches with linear-time engine', () => {
    const re = compileRegex('foo.*bar');
    expect(re.test('xfoozbar')).toBe(true);
    expect(re.test('nope')).toBe(false);
  });

  it('stays linear on a catastrophic-backtracking pattern (ReDoS-safe)', () => {
    const re = compileRegex('(a+)+$');
    const start = Date.now();
    const result = re.test(`${'a'.repeat(REDOS_INPUT_LEN)}b`);
    expect(result).toBe(false);
    // Would hang under a backtracking engine; re2js stays linear.
    expect(Date.now() - start).toBeLessThan(REDOS_BUDGET_MS);
  });

  it('throws invalid_pattern on a syntax error', () => {
    expect(() => compileRegex('(')).toThrow('invalid_pattern');
  });

  it('extracts the longest required literal from a concatenation', () => {
    expect(extractRequiredLiteral('foo.*barbaz')).toBe('barbaz');
  });

  it('returns null when no literal is required (alternation / leading quantifier)', () => {
    expect(extractRequiredLiteral('(foo|foobar)')).toBeNull();
    expect(extractRequiredLiteral('[a-z]+')).toBeNull();
    expect(extractRequiredLiteral('.*')).toBeNull();
  });

  it('matchEntry honours the on-target', () => {
    const re = compileRegex('secret');
    expect(matchEntry(re, { key: 'k', value: 'has secret' }, 'values')).toBe(true);
    expect(matchEntry(re, { key: 'k', value: 'has secret' }, 'keys')).toBe(false);
    expect(matchEntry(re, { key: 'secret', value: 'v' }, 'both')).toBe(true);
  });
});
