import { describe, expect, it } from '@jest/globals';

import { formatCsvRow } from './formatCsvRow.js';

describe('formatCsvRow', () => {
  it('joins plain cells with commas', () => {
    expect(formatCsvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });
  it('quotes cells containing commas', () => {
    expect(formatCsvRow(['a,b', 'c'])).toBe('"a,b",c');
  });
  it('escapes quotes inside quoted cells', () => {
    expect(formatCsvRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });
  it('quotes cells with newlines', () => {
    expect(formatCsvRow(['line1\nline2'])).toBe('"line1\nline2"');
  });
  it('renders empty cells as blank', () => {
    expect(formatCsvRow(['', 'x'])).toBe(',x');
  });
});
