import { filterDefault } from './filter.js';

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
