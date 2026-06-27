import { describe, expect, it } from '@jest/globals';

import { filterByMatcher } from '../matcher.js';

const LONG_RUN = 40;
const BUDGET_MS = 1000;

const entries = [
  { key: 'order:1', value: 'foobar' },
  { key: 'order:2', value: 'baz' },
];

describe('filterByMatcher regex matching (re2js)', () => {
  it('matches a regex on values', () => {
    const out = filterByMatcher(entries, 'values', { kind: 'regex', pattern: 'foo.*bar', flags: '' });
    expect(out.map((e) => e.key)).toEqual(['order:1']);
  });

  it('matches a regex on keys', () => {
    const out = filterByMatcher(entries, 'keys', { kind: 'regex', pattern: 'order:2', flags: '' });
    expect(out.map((e) => e.key)).toEqual(['order:2']);
  });

  it('matches on either key or value when on=both', () => {
    const out = filterByMatcher(entries, 'both', { kind: 'regex', pattern: 'baz', flags: '' });
    expect(out.map((e) => e.key)).toEqual(['order:2']);
  });

  it('honours the case-insensitive flag', () => {
    const out = filterByMatcher(entries, 'values', { kind: 'regex', pattern: 'FOOBAR', flags: 'i' });
    expect(out.map((e) => e.key)).toEqual(['order:1']);
    const sensitive = filterByMatcher(entries, 'values', { kind: 'regex', pattern: 'FOOBAR', flags: '' });
    expect(sensitive).toEqual([]);
  });
});

describe('filterByMatcher edge cases (re2js)', () => {
  it('still supports substring matchers', () => {
    const out = filterByMatcher(entries, 'values', {
      kind: 'substring',
      query: 'BAR',
      caseInsensitive: true,
    });
    expect(out.map((e) => e.key)).toEqual(['order:1']);
  });

  it('surfaces a clean error for an invalid pattern', () => {
    expect(() =>
      filterByMatcher(entries, 'values', { kind: 'regex', pattern: '(unbalanced', flags: '' })
    ).toThrow(/invalid regex/v);
  });

  it('stays linear on a catastrophic pattern', () => {
    const start = Date.now();
    filterByMatcher([{ key: 'k', value: `${'a'.repeat(LONG_RUN)}b` }], 'values', {
      kind: 'regex',
      pattern: '(a+)+$',
      flags: '',
    });
    expect(Date.now() - start).toBeLessThan(BUDGET_MS);
  });
});
