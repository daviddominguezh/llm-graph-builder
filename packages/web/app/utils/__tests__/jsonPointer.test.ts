import { describe, expect, it } from '@jest/globals';

import { setByJsonPointer } from '../jsonPointer';

describe('setByJsonPointer (FE)', () => {
  it('sets a nested path without mutating input', () => {
    const input = { a: 1 };
    const out = setByJsonPointer(input, '/forms/email', 'x');
    expect(out).toEqual({ a: 1, forms: { email: 'x' } });
    expect(input).toEqual({ a: 1 });
  });

  it('decodes ~1 and ~0 escape sequences', () => {
    const out = setByJsonPointer({}, '/a~1b/c~0d', 1);
    expect(out).toEqual({ 'a/b': { 'c~d': 1 } });
  });

  it('returns a shallow clone for the empty pointer', () => {
    const input = { a: 1 };
    const out = setByJsonPointer(input, '', 'ignored');
    expect(out).toEqual({ a: 1 });
    expect(out).not.toBe(input);
  });

  it('replaces non-record intermediate values with a fresh object', () => {
    const input = { a: 5 };
    const out = setByJsonPointer(input, '/a/b', 2);
    expect(out).toEqual({ a: { b: 2 } });
  });
});
