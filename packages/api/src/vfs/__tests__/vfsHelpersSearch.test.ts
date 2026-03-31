import { describe, expect, it } from '@jest/globals';

import {
  countContentLines,
  countMatchingLines,
  runWithConcurrency,
  searchInContent,
} from '../vfsContextHelpers.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEST_PATH = 'src/app.ts';
const FIVE_LINE_CONTENT = 'alpha\nbeta\ngamma\ndelta\nepsilon';
const LINE_THREE = 3;
const EXPECTED_COLUMN_FOUR = 4;
const CONTEXT_COUNT_TWO = 2;
const CONCURRENCY_TWO = 2;
const TASK_COUNT_FIVE = 5;
const MATCH_COUNT_THREE = 3;
const LINE_COUNT_THREE = 3;
const NO_ITEMS = 0;
const SINGLE_LINE = 1;
const EXPECTED_LITERAL_MATCHES = 2;
const EXPECTED_REGEX_MATCHES = 2;

// ─── Search params factory ──────────────────────────────────────────────────

interface SearchTestParams {
  content: string;
  filePath: string;
  pattern: string;
  isRegex: boolean;
  ignoreCase: boolean;
}

function makeParams(overrides: Partial<SearchTestParams> = {}): SearchTestParams {
  return {
    content: FIVE_LINE_CONTENT,
    filePath: TEST_PATH,
    pattern: 'gamma',
    isRegex: false,
    ignoreCase: false,
    ...overrides,
  };
}

// ─── searchInContent — literal ──────────────────────────────────────────────

function describeSearchLiteralMatch(): void {
  it('finds a literal match', () => {
    const [first] = searchInContent(makeParams());
    expect(first?.line).toBe(LINE_THREE);
    expect(first?.content).toBe('gamma');
  });

  it('finds multiple matches', () => {
    const content = 'foo\nbar\nfoo\nbaz\nfoo';
    const matches = searchInContent(makeParams({ content, pattern: 'foo' }));
    expect(matches).toHaveLength(MATCH_COUNT_THREE);
  });

  it('returns empty for no matches', () => {
    const matches = searchInContent(makeParams({ pattern: 'zzz' }));
    expect(matches).toHaveLength(NO_ITEMS);
  });
}

// ─── searchInContent — regex ────────────────────────────────────────────────

function describeSearchRegex(): void {
  it('finds regex matches', () => {
    const [first] = searchInContent(makeParams({ pattern: 'g.mma', isRegex: true }));
    expect(first?.content).toBe('gamma');
  });

  it('finds case-insensitive matches', () => {
    const content = 'Hello\nhello\nHELLO';
    const params = makeParams({ content, pattern: 'hello', ignoreCase: true });
    expect(searchInContent(params)).toHaveLength(MATCH_COUNT_THREE);
  });
}

// ─── searchInContent — context lines ────────────────────────────────────────

function describeSearchContext(): void {
  it('includes 2 context lines before/after', () => {
    const [first] = searchInContent(makeParams());
    expect(first?.contextBefore).toHaveLength(CONTEXT_COUNT_TWO);
    expect(first?.contextBefore).toEqual(['alpha', 'beta']);
    expect(first?.contextAfter).toHaveLength(CONTEXT_COUNT_TWO);
    expect(first?.contextAfter).toEqual(['delta', 'epsilon']);
  });

  it('clamps context at first line', () => {
    const [first] = searchInContent(makeParams({ pattern: 'alpha' }));
    expect(first?.contextBefore).toHaveLength(NO_ITEMS);
  });

  it('clamps context at last line', () => {
    const [first] = searchInContent(makeParams({ pattern: 'epsilon' }));
    expect(first?.contextAfter).toHaveLength(NO_ITEMS);
  });
}

// ─── searchInContent — column ───────────────────────────────────────────────

function describeSearchColumn(): void {
  it('detects column position (1-based)', () => {
    const content = 'abcXdef';
    const [first] = searchInContent(makeParams({ content, pattern: 'X' }));
    expect(first?.column).toBe(EXPECTED_COLUMN_FOUR);
  });
}

// ─── runWithConcurrency ─────────────────────────────────────────────────────

function describeRunWithConcurrency(): void {
  it('collects all results in order', async () => {
    const tasks = Array.from(
      { length: TASK_COUNT_FIVE },
      (_, i) => async () => await Promise.resolve(i)
    );
    const results = await runWithConcurrency(tasks, CONCURRENCY_TWO);
    expect(results).toHaveLength(TASK_COUNT_FIVE);
  });

  it('handles empty tasks', async () => {
    const results = await runWithConcurrency([], CONCURRENCY_TWO);
    expect(results).toEqual([]);
  });
}

// ─── countContentLines ──────────────────────────────────────────────────────

function describeCountContentLines(): void {
  it('counts lines in normal content', () => {
    expect(countContentLines('a\nb\nc')).toBe(LINE_COUNT_THREE);
  });

  it('returns 0 for empty string', () => {
    expect(countContentLines('')).toBe(NO_ITEMS);
  });

  it('returns 1 for single line without newline', () => {
    expect(countContentLines('hello')).toBe(SINGLE_LINE);
  });

  it('counts trailing newline as extra line', () => {
    expect(countContentLines('a\nb\n')).toBe(LINE_COUNT_THREE);
  });
}

// ─── countMatchingLines ─────────────────────────────────────────────────────

function describeCountMatchingLines(): void {
  it('counts literal matches', () => {
    expect(countMatchingLines('foo\nbar\nfoo', 'foo', false)).toBe(EXPECTED_LITERAL_MATCHES);
  });

  it('counts regex matches', () => {
    expect(countMatchingLines('cat\ncar\ncap', 'ca[rt]', true)).toBe(EXPECTED_REGEX_MATCHES);
  });

  it('returns 0 for no matches', () => {
    expect(countMatchingLines('hello\nworld', 'zzz', false)).toBe(NO_ITEMS);
  });
}

// ─── Top-level describe ─────────────────────────────────────────────────────

describe('searchInContent — literal', describeSearchLiteralMatch);
describe('searchInContent — regex', describeSearchRegex);
describe('searchInContent — context lines', describeSearchContext);
describe('searchInContent — column', describeSearchColumn);
describe('runWithConcurrency', describeRunWithConcurrency);
describe('countContentLines', describeCountContentLines);
describe('countMatchingLines', describeCountMatchingLines);
