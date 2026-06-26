import { describe, expect, it } from '@jest/globals';

import { parseSnapshotSkills } from './snapshotSkills.js';

const FIRST_SORT = 0;
const ONE = 1;

describe('parseSnapshotSkills', () => {
  it('parses valid rows and strips extra fields', () => {
    const out = parseSnapshotSkills([
      { name: 'r', description: 'd', content: 'c', repoUrl: null, sortOrder: FIRST_SORT },
    ]);
    expect(out).toEqual([{ name: 'r', description: 'd', content: 'c' }]);
  });

  it('drops invalid rows', () => {
    expect(parseSnapshotSkills([{ name: 'r', description: 'd', content: 'c' }, { name: 'x' }])).toHaveLength(
      ONE
    );
  });

  it('non-array → []', () => {
    expect(parseSnapshotSkills(undefined)).toEqual([]);
  });
});
