import { describe, expect, it } from 'vitest';

import { randomUUID } from './uuid.js';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  it('delegates to crypto.randomUUID when available', () => {
    expect(randomUUID()).toMatch(UUID_SHAPE);
  });
  it('falls back to getRandomValues when randomUUID missing', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: orig.getRandomValues.bind(orig) },
      configurable: true,
    });
    expect(randomUUID()).toMatch(UUID_SHAPE);
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true });
  });
  it('falls back to Math.random when no crypto at all', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    expect(randomUUID()).toMatch(/^fallback-/);
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true });
  });
});
