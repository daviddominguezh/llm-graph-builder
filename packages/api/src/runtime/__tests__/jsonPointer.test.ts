import { describe, expect, it } from '@jest/globals';

import { setByJsonPointer } from '../jsonPointer.js';

describe('setByJsonPointer', () => {
  it('sets a nested path, creating intermediates, without mutating input', () => {
    const input = { a: { b: 'keep' } };
    const out = setByJsonPointer(input, '/forms/contact/email', 'a@b.com');
    expect(out).toEqual({ a: { b: 'keep' }, forms: { contact: { email: 'a@b.com' } } });
    expect(input).toEqual({ a: { b: 'keep' } });
  });

  it('decodes ~1 and ~0 escapes', () => {
    const out = setByJsonPointer({}, '/a~1b/c~0d', 'v');
    expect(out).toEqual({ 'a/b': { 'c~d': 'v' } });
  });

  it('preserves sibling keys when setting into an existing nested object', () => {
    const input = { forms: { contact: { name: 'x' } } };
    const out = setByJsonPointer(input, '/forms/contact/email', 'a@b.com');
    expect(out).toEqual({ forms: { contact: { name: 'x', email: 'a@b.com' } } });
    expect(input).toEqual({ forms: { contact: { name: 'x' } } });
  });

  it('sets a numeric (array-index) segment as an object key', () => {
    const out = setByJsonPointer({}, '/items/0/name', 'first');
    expect(out).toEqual({ items: { '0': { name: 'first' } } });
  });

  it('overwrites a primitive on a missing/invalid intermediate path', () => {
    const out = setByJsonPointer({ a: 'primitive' }, '/a/b', 'v');
    expect(out).toEqual({ a: { b: 'v' } });
  });

  it('returns a shallow copy of the whole document for the empty pointer', () => {
    const input = { a: 'x' };
    const out = setByJsonPointer(input, '', 'ignored');
    expect(out).toEqual({ a: 'x' });
    expect(out).not.toBe(input);
  });
});
