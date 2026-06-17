import { filterByMatcher, filterDefault } from './filter.js';

describe('filterDefault', () => {
  const entries = [
    { key: 'user.name', value: 'Alice' },
    { key: 'user.email', value: 'alice@example.com' },
    { key: 'flags.beta', value: 'true' },
  ];

  it('matches substring on key or value, case-insensitive', () => {
    expect(filterDefault(entries, 'USER')).toEqual([entries[0], entries[1]]);
    expect(filterDefault(entries, 'beta')).toEqual([entries[2]]);
    expect(filterDefault(entries, 'alice')).toEqual([entries[0], entries[1]]);
  });

  it('returns all entries on empty query', () => {
    expect(filterDefault(entries, '')).toEqual(entries);
  });

  it('returns empty array on no match', () => {
    expect(filterDefault(entries, 'zzz')).toEqual([]);
  });
});

describe('filterByMatcher', () => {
  const entries = [
    { key: 'user.name', value: 'Alice' },
    { key: 'flags.beta', value: 'true' },
  ];

  it('substring on=keys ignores values', () => {
    expect(
      filterByMatcher(entries, 'keys', { kind: 'substring', query: 'alice', caseInsensitive: true })
    ).toEqual([]);
  });

  it('substring on=values matches only values', () => {
    expect(
      filterByMatcher(entries, 'values', { kind: 'substring', query: 'alice', caseInsensitive: true })
    ).toEqual([entries[0]]);
  });

  it('substring on=both matches either side', () => {
    expect(
      filterByMatcher(entries, 'both', { kind: 'substring', query: 'user', caseInsensitive: true })
    ).toEqual([entries[0]]);
  });

  it('substring caseInsensitive=false is case-sensitive', () => {
    expect(
      filterByMatcher(entries, 'values', {
        kind: 'substring',
        query: 'ALICE',
        caseInsensitive: false,
      })
    ).toEqual([]);
    expect(
      filterByMatcher(entries, 'values', {
        kind: 'substring',
        query: 'Alice',
        caseInsensitive: false,
      })
    ).toEqual([entries[0]]);
  });

  it('substring with empty query returns all entries', () => {
    expect(
      filterByMatcher(entries, 'both', { kind: 'substring', query: '', caseInsensitive: true })
    ).toEqual(entries);
  });

  it('regex on=keys with RE2', () => {
    expect(
      filterByMatcher(entries, 'keys', { kind: 'regex', pattern: '^flags\\..*', flags: '' })
    ).toEqual([entries[1]]);
  });

  it('throws SyntaxError on invalid pattern', () => {
    expect(() =>
      filterByMatcher(entries, 'keys', { kind: 'regex', pattern: '[unterminated', flags: '' })
    ).toThrow(/missing \]/);
  });
});
