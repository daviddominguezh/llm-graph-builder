import { describe, expect, it } from '@jest/globals';

import { createSimStateStore, deepFreeze } from '../simStateStore.js';

describe('createSimStateStore read()', () => {
  it('returns a frozen view where mutation throws', () => {
    const store = createSimStateStore({ a: 'x' }, true);
    const view: Record<string, unknown> = store.read();
    expect(() => {
      view.a = 'y';
    }).toThrow();
  });

  it('does not expose the authoritative reference across reads', () => {
    const store = createSimStateStore({ a: { b: 'x' } }, true);
    const first = store.read();
    const second = store.read();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe('createSimStateStore write()', () => {
  it('applies, records a patch, and deep-clones the value', () => {
    const store = createSimStateStore({}, true);
    const value = { email: 'a@b.com' };
    const patch = store.write('set_form_fields', '/forms/contact', value);
    value.email = 'mutated';
    expect(patch).toEqual({
      tool: 'set_form_fields',
      path: '/forms/contact',
      value: { email: 'a@b.com' },
    });
    expect(store.snapshot()).toEqual({ forms: { contact: { email: 'a@b.com' } } });
  });

  it('accumulates patches without mutating the previous snapshot', () => {
    const store = createSimStateStore({}, true);
    store.write('t1', '/a', 'first');
    const afterFirst = store.snapshot();
    store.write('t2', '/b', 'second');
    // The earlier snapshot must not be mutated by the second write.
    expect(afterFirst).toEqual({ a: 'first' });
    expect(store.snapshot()).toEqual({ a: 'first', b: 'second' });
    expect(store.patches()).toEqual([
      { tool: 't1', path: '/a', value: 'first' },
      { tool: 't2', path: '/b', value: 'second' },
    ]);
  });
});

describe('createSimStateStore guards', () => {
  it('patches() returns a defensive copy', () => {
    const store = createSimStateStore({}, true);
    store.write('t1', '/a', 'v');
    const list = store.patches();
    list.push({ tool: 'x', path: '/y', value: 'z' });
    expect(store.patches()).toEqual([{ tool: 't1', path: '/a', value: 'v' }]);
  });

  it('write() is a silent no-op when not writable', () => {
    const store = createSimStateStore({}, false);
    expect(store.write('t', '/x', 'v')).toBeNull();
    expect(store.snapshot()).toEqual({});
    expect(store.patches()).toEqual([]);
  });

  it('does not mutate the initial object passed in', () => {
    const initial = { a: 'x' };
    const store = createSimStateStore(initial, true);
    store.write('t', '/b', 'y');
    expect(initial).toEqual({ a: 'x' });
  });
});

describe('deepFreeze', () => {
  it('recursively freezes nested objects and arrays', () => {
    const frozen = deepFreeze({ a: { b: ['v'] } });
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
  });
});
