import { buildBitmask, computeBloomPositions } from '../bloomFilter.js';

const EXPECTED_HASH_COUNT = 7;
const BLOOM_SIZE = 9600;
const ZERO = 0;
const ONE = 1;

describe('computeBloomPositions', () => {
  it('returns exactly 7 positions', () => {
    const positions = computeBloomPositions('my-org');
    expect(positions).toHaveLength(EXPECTED_HASH_COUNT);
  });

  it('all positions are within [0, 9600)', () => {
    const positions = computeBloomPositions('my-org');
    for (const pos of positions) {
      expect(pos).toBeGreaterThanOrEqual(ZERO);
      expect(pos).toBeLessThan(BLOOM_SIZE);
    }
  });

  it('returns the same positions for the same input', () => {
    const a = computeBloomPositions('hello-world');
    const b = computeBloomPositions('hello-world');
    expect(a).toEqual(b);
  });

  it('returns different positions for different inputs', () => {
    const a = computeBloomPositions('org-alpha');
    const b = computeBloomPositions('org-beta');
    expect(a).not.toEqual(b);
  });
});

describe('buildBitmask', () => {
  it('returns a string of exactly 9600 characters', () => {
    const mask = buildBitmask('my-org');
    expect(mask).toHaveLength(BLOOM_SIZE);
  });

  it('contains only 0s and 1s', () => {
    const mask = buildBitmask('my-org');
    expect(mask).toMatch(/^[01]+$/v);
  });

  it('has 1 to 7 bits set (one per hash, collisions reduce count)', () => {
    const mask = buildBitmask('my-org');
    const setBits = Array.from(mask).filter((c) => c === '1');
    expect(setBits.length).toBeGreaterThanOrEqual(ONE);
    expect(setBits.length).toBeLessThanOrEqual(EXPECTED_HASH_COUNT);
  });

  it('has 1s at exactly the computed positions', () => {
    const slug = 'test-slug';
    const positions = computeBloomPositions(slug);
    const mask = buildBitmask(slug);
    for (const pos of positions) {
      const { [pos]: bit } = mask;
      expect(bit).toBe('1');
    }
  });
});
