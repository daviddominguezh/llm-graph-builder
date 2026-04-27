import { describe, expect, it } from '@jest/globals';

import { parsePath } from './parsePath.js';

describe('parsePath', () => {
  it('simple field', () => {
    expect(parsePath('name')).toEqual({
      ok: true,
      segments: [{ fieldName: 'name', indices: [] }],
    });
  });

  it('dotted', () => {
    expect(parsePath('a.b')).toMatchObject({
      ok: true,
      segments: [{ fieldName: 'a' }, { fieldName: 'b' }],
    });
  });

  it('concrete index', () => {
    expect(parsePath('a[2].b')).toMatchObject({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- Test data constant
      segments: [{ indices: [2] }, {}],
    });
  });

  it('wildcard', () => {
    expect(parsePath('a[].b')).toMatchObject({
      ok: true,
      segments: [{ indices: ['wildcard'] }, {}],
    });
  });

  it('multi-dim', () => {
    expect(parsePath('m[0][1]')).toMatchObject({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- Test data constants
      segments: [{ indices: [0, 1] }],
    });
  });
});

describe('parsePath errors', () => {
  it('rejects empty', () => {
    expect(parsePath('').ok).toBe(false);
  });

  it('rejects negative index', () => {
    expect(parsePath('a[-1]').ok).toBe(false);
  });

  it('rejects non-integer index', () => {
    expect(parsePath('a[abc]').ok).toBe(false);
  });

  it('rejects trailing dot', () => {
    expect(parsePath('a.').ok).toBe(false);
  });

  it('rejects leading digit', () => {
    expect(parsePath('1a').ok).toBe(false);
  });

  it('rejects unclosed bracket', () => {
    expect(parsePath('a[').ok).toBe(false);
  });
});
