import { describe, expect, it } from '@jest/globals';

import { mapNextRunAt } from '../triggerQueries.js';

describe('mapNextRunAt', () => {
  it('serializes next_run_at to whole-second ISO', () => {
    expect(mapNextRunAt(new Date('2026-06-24T09:00:00Z'))).toBe('2026-06-24T09:00:00.000Z');
  });

  it('returns null for a null date', () => {
    expect(mapNextRunAt(null)).toBeNull();
  });
});
