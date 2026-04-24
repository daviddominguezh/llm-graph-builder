import { describe, expect, it } from '@jest/globals';

import { normalizePath } from './normalizePath.js';

describe('normalizePath', () => {
  it('passes simple paths', () => { expect(normalizePath('name')).toBe('name'); });
  it('wildcards concrete indices', () => { expect(normalizePath('a[2].b')).toBe('a[].b'); });
  it('multi-dim', () => { expect(normalizePath('m[0][1]')).toBe('m[][]'); });
  it('passes already-canonical', () => { expect(normalizePath('a[].b')).toBe('a[].b'); });
  it('null on invalid', () => { expect(normalizePath('a[-1]')).toBeNull(); });
});
