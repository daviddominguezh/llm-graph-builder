import { describe, expect, it } from '@jest/globals';

import { slugNormalize } from './slugNormalize.js';

const MAX_LEN = 64;
const FIRST_RUN = 63;
const SECOND_RUN = 10;

describe('slugNormalize', () => {
  it('lowercases + hyphenates spaces', () => {
    expect(slugNormalize('Lead Capture')).toBe('lead-capture');
  });
  it('strips invalid chars', () => {
    expect(slugNormalize('Lead@Capture!')).toBe('leadcapture');
  });
  it('collapses hyphens', () => {
    expect(slugNormalize('a---b')).toBe('a-b');
  });
  it('trims edges', () => {
    expect(slugNormalize('--x--')).toBe('x');
  });
  it('truncates to 64 with no trailing hyphen', () => {
    const s = slugNormalize(`${'a'.repeat(FIRST_RUN)}-${'b'.repeat(SECOND_RUN)}`);
    expect(s).toHaveLength(MAX_LEN);
    expect(s.endsWith('-')).toBe(false);
  });
  it('empty for all-invalid input', () => {
    expect(slugNormalize('@@@')).toBe('');
  });
});
