import { describe, expect, it } from '@jest/globals';

import { runValidation } from './runValidation.js';

const CHAR_COUNT = 5;
const MIN_CHAR = 4;
const AGE_18 = 18;
const AGE_5 = 5;
const MAX_AGE = 100;

describe('runValidation', () => {
  it('email — accepts valid, rejects invalid', () => {
    expect(runValidation('x@y.co', { kind: 'email' }).ok).toBe(true);
    expect(runValidation('nope', { kind: 'email' }).ok).toBe(false);
  });
  it('twoWordName — needs ≥2 words each ≥2 chars', () => {
    expect(runValidation('John Doe', { kind: 'twoWordName' }).ok).toBe(true);
    expect(runValidation('Madonna', { kind: 'twoWordName' }).ok).toBe(false);
    expect(runValidation('A B', { kind: 'twoWordName' }).ok).toBe(false);
  });
  it('pastDate / futureDate', () => {
    const past = '2020-01-01';
    const future = '2999-01-01';
    expect(runValidation(past, { kind: 'pastDate' }).ok).toBe(true);
    expect(runValidation(future, { kind: 'pastDate' }).ok).toBe(false);
    expect(runValidation(future, { kind: 'futureDate' }).ok).toBe(true);
  });
  it('length on strings — char count', () => {
    expect(runValidation('abcde', { kind: 'length', exact: CHAR_COUNT }).ok).toBe(true);
    expect(runValidation('abc', { kind: 'length', min: MIN_CHAR }).ok).toBe(false);
    expect(runValidation('abcdef', { kind: 'length', max: CHAR_COUNT }).ok).toBe(false);
  });
  it('length on numbers — value range', () => {
    expect(runValidation(AGE_18, { kind: 'length', min: AGE_18, max: MAX_AGE }).ok).toBe(true);
    expect(runValidation(AGE_5, { kind: 'length', min: AGE_18 }).ok).toBe(false);
  });
});
