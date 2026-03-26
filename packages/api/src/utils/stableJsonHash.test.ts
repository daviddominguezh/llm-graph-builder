import { describe, expect, it } from '@jest/globals';

import { stableJsonStringify } from './stableJsonHash.js';

const ONE = 1;
const TWO = 2;
const THREE = 3;
const FORTY_TWO = 42;

describe('stableJsonStringify', () => {
  it('sorts keys alphabetically', () => {
    const a = stableJsonStringify({ z: ONE, a: TWO });
    const b = stableJsonStringify({ a: TWO, z: ONE });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"z":1}');
  });

  it('sorts nested object keys', () => {
    const result = stableJsonStringify({ b: { z: ONE, a: TWO }, a: THREE });
    expect(result).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it('handles arrays (preserves order)', () => {
    const result = stableJsonStringify({ items: [THREE, ONE, TWO] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('handles null and primitives', () => {
    expect(stableJsonStringify(null)).toBe('null');
    expect(stableJsonStringify('hello')).toBe('"hello"');
    expect(stableJsonStringify(FORTY_TWO)).toBe('42');
  });
});
