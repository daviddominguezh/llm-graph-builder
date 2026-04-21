import { describe, expect, it } from '@jest/globals';

import { VFSErrorCode } from '../types.js';
import { applyEdits, estimateTokens, extractLineRange, isBinary } from '../vfsContextHelpers.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const BYTE_H = 72;
const BYTE_E = 101;
const BYTE_NULL = 0;
const BYTE_L = 108;
const BYTE_O = 111;
const BYTE_AFTER_8K = 8192;
const SIZE_OVER_8K = 8193;
const ASCII_A = 65;
const LINE_COUNT_FIVE = 5;
const LINE_THREE = 3;
const LINE_TWO = 2;
const LINE_FOUR = 4;
const LINE_TEN = 10;
const FIRST_LINE = 1;
const ZERO_LINES = 0;
const EXPECTED_TOKENS = 2;
const ZERO_TOKENS = 0;

// ─── isBinary ────────────────────────────────────────────────────────────────

function describeIsBinary(): void {
  it('detects null byte in first 8KB', () => {
    const bytes = new Uint8Array([BYTE_H, BYTE_E, BYTE_NULL, BYTE_L, BYTE_O]);
    expect(isBinary(bytes)).toBe(true);
  });

  it('returns false for text content', () => {
    const bytes = new TextEncoder().encode('Hello, world!\nLine two.');
    expect(isBinary(bytes)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(isBinary(new Uint8Array([]))).toBe(false);
  });

  it('ignores null byte after 8KB', () => {
    const bytes = new Uint8Array(SIZE_OVER_8K).fill(ASCII_A);
    bytes[BYTE_AFTER_8K] = BYTE_NULL;
    expect(isBinary(bytes)).toBe(false);
  });
}

// ─── extractLineRange — basic ───────────────────────────────────────────────

function describeExtractRangeBasic(): void {
  const content = 'line1\nline2\nline3\nline4\nline5';

  it('returns full file when no range given', () => {
    const result = extractLineRange(content);
    expect(result.lines).toBe(content);
    expect(result.startLine).toBe(FIRST_LINE);
    expect(result.endLine).toBe(LINE_COUNT_FIVE);
    expect(result.totalLines).toBe(LINE_COUNT_FIVE);
  });

  it('extracts from start only', () => {
    const result = extractLineRange(content, LINE_THREE);
    expect(result.lines).toBe('line3\nline4\nline5');
    expect(result.startLine).toBe(LINE_THREE);
  });

  it('extracts to end only', () => {
    const result = extractLineRange(content, undefined, LINE_THREE);
    expect(result.lines).toBe('line1\nline2\nline3');
    expect(result.endLine).toBe(LINE_THREE);
  });

  it('extracts a start+end range', () => {
    const result = extractLineRange(content, LINE_TWO, LINE_FOUR);
    expect(result.lines).toBe('line2\nline3\nline4');
  });
}

// ─── extractLineRange — edge ────────────────────────────────────────────────

function describeExtractRangeEdge(): void {
  const content = 'line1\nline2\nline3\nline4\nline5';

  it('handles start > total lines', () => {
    const result = extractLineRange(content, LINE_TEN);
    expect(result.lines).toBe('');
  });

  it('extracts a single line', () => {
    const result = extractLineRange(content, LINE_THREE, LINE_THREE);
    expect(result.lines).toBe('line3');
  });

  it('handles empty file', () => {
    const result = extractLineRange('');
    expect(result.totalLines).toBe(ZERO_LINES);
    expect(result.lines).toBe('');
  });
}

// ─── estimateTokens ─────────────────────────────────────────────────────────

function describeEstimateTokens(): void {
  it('estimates tokens for simple string', () => {
    expect(estimateTokens('abcdefgh')).toBe(EXPECTED_TOKENS);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(ZERO_TOKENS);
  });
}

// ─── applyEdits ─────────────────────────────────────────────────────────────

function describeApplyEditsSingle(): void {
  it('applies a single edit', () => {
    const result = applyEdits('hello world', [{ old_text: 'world', new_text: 'earth' }]);
    expect(result).toBe('hello earth');
  });

  it('applies multiple edits sequentially', () => {
    const edits = [
      { old_text: 'aaa', new_text: 'xxx' },
      { old_text: 'bbb', new_text: 'yyy' },
    ];
    expect(applyEdits('aaa bbb ccc', edits)).toBe('xxx yyy ccc');
  });

  it('supports deletion (empty new_text)', () => {
    const result = applyEdits('remove me please', [{ old_text: ' me', new_text: '' }]);
    expect(result).toBe('remove please');
  });

  it('applies edit that changes line count', () => {
    const edits = [{ old_text: 'line2', new_text: 'line2\nline3\nline4' }];
    expect(applyEdits('line1\nline2', edits)).toBe('line1\nline2\nline3\nline4');
  });
}

function describeApplyEditsErrors(): void {
  it('throws MATCH_NOT_FOUND when old_text missing', () => {
    expect(() => {
      applyEdits('hello', [{ old_text: 'missing', new_text: 'x' }]);
    }).toThrow(expect.objectContaining({ code: VFSErrorCode.MATCH_NOT_FOUND }));
  });

  it('throws AMBIGUOUS_MATCH when old_text appears twice', () => {
    expect(() => {
      applyEdits('aaa aaa', [{ old_text: 'aaa', new_text: 'bbb' }]);
    }).toThrow(expect.objectContaining({ code: VFSErrorCode.AMBIGUOUS_MATCH }));
  });
}

// ─── Top-level describe ─────────────────────────────────────────────────────

describe('isBinary', describeIsBinary);
describe('extractLineRange — basic', describeExtractRangeBasic);
describe('extractLineRange — edge', describeExtractRangeEdge);
describe('estimateTokens', describeEstimateTokens);
describe('applyEdits — single & multi', describeApplyEditsSingle);
describe('applyEdits — errors', describeApplyEditsErrors);
