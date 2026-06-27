import { describe, expect, it } from '@jest/globals';

import { buildRing, hashKey } from '../ring.js';

const KEY_COUNT = 400;
const HALF = 2;

describe('hashKey', () => {
  it('is deterministic', () => {
    expect(hashKey('a::t::b')).toBe(hashKey('a::t::b'));
  });
});

describe('ring ownerFor', () => {
  it('returns null for empty membership', () => {
    expect(buildRing([]).ownerFor('a::t::b')).toBeNull();
  });

  it('maps a key to one of the member machines, stably', () => {
    const ring = buildRing(['m1', 'm2', 'm3']);
    const owner = ring.ownerFor('a::t::b');
    expect(['m1', 'm2', 'm3']).toContain(owner);
    expect(ring.ownerFor('a::t::b')).toBe(owner);
  });

  it('remaps only a minority of keys when one machine leaves (consistent hashing)', () => {
    const before = buildRing(['m1', 'm2', 'm3', 'm4']);
    const after = buildRing(['m1', 'm2', 'm3']); // m4 left
    const keys = Array.from({ length: KEY_COUNT }, (_, i) => `agent${String(i)}::t::b`);
    const survivors = keys.filter((k) =>
      before.ownerFor(k) === 'm4' ? false : before.ownerFor(k) === after.ownerFor(k)
    );
    const moved = keys.length - survivors.length;
    expect(moved).toBeLessThan(keys.length / HALF);
  });
});
