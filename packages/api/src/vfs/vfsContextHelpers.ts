// vfsContextHelpers.ts — pure/near-pure helper functions for VFSContext
import type { Edit, SearchTextMatch } from './types.js';
import { VFSError, VFSErrorCode } from './types.js';

const BINARY_CHECK_SIZE = 8192;
const NULL_BYTE = 0;
const CONTEXT_LINES = 2;
const FIRST_LINE = 1;
const ZERO = 0;
const TOKEN_CHARS_PER_TOKEN = 4;
const PREVIEW_LENGTH = 40;

// ─── Binary Detection ────────────────────────────────────────────────────────

export function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, BINARY_CHECK_SIZE);
  for (let i = ZERO; i < limit; i += FIRST_LINE) {
    if (bytes[i] === NULL_BYTE) return true;
  }
  return false;
}

// ─── Line Range Extraction ───────────────────────────────────────────────────

interface LineRangeResult {
  lines: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

export function extractLineRange(content: string, start?: number, end?: number): LineRangeResult {
  const allLines = content.split('\n');
  const { length: totalLines } = allLines;
  const startLine = Math.max(FIRST_LINE, start ?? FIRST_LINE);
  const endLine = Math.min(totalLines, end ?? totalLines);
  const sliced = allLines.slice(startLine - FIRST_LINE, endLine);
  return { lines: sliced.join('\n'), startLine, endLine, totalLines };
}

// ─── Token Estimation ────────────────────────────────────────────────────────

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / TOKEN_CHARS_PER_TOKEN);
}

// ─── Edit Application ────────────────────────────────────────────────────────

function findEditMatch(content: string, oldText: string): number {
  const firstIndex = content.indexOf(oldText);
  if (firstIndex < ZERO) {
    throw new VFSError(VFSErrorCode.MATCH_NOT_FOUND, `No match found for edit: "${oldText.slice(ZERO, PREVIEW_LENGTH)}..."`);
  }
  const secondIndex = content.indexOf(oldText, firstIndex + FIRST_LINE);
  if (secondIndex >= ZERO) {
    throw new VFSError(VFSErrorCode.AMBIGUOUS_MATCH, `Multiple matches found for: "${oldText.slice(ZERO, PREVIEW_LENGTH)}..."`);
  }
  return firstIndex;
}

function applySingleEdit(content: string, edit: Edit): string {
  const index = findEditMatch(content, edit.old_text);
  return content.slice(ZERO, index) + edit.new_text + content.slice(index + edit.old_text.length);
}

export function applyEdits(content: string, edits: Edit[]): string {
  // Validate all edits on original content first (atomic check)
  for (const edit of edits) {
    findEditMatch(content, edit.old_text);
  }
  // Apply edits sequentially on working copy
  let result = content;
  for (const edit of edits) {
    result = applySingleEdit(result, edit);
  }
  return result;
}

// ─── Text Search ─────────────────────────────────────────────────────────────

function escapeRegex(text: string): string {
  // Escape each special regex char individually to avoid v-flag character class issues
  let result = '';
  for (const ch of text) {
    if ('.*+?^${}()|[]\\'.includes(ch)) {
      result += `\\${ch}`;
    } else {
      result += ch;
    }
  }
  return result;
}

function buildRegex(pattern: string, isRegex: boolean, ignoreCase: boolean): RegExp {
  const source = isRegex ? pattern : escapeRegex(pattern);
  const flags = ignoreCase ? 'giv' : 'gv';
  return new RegExp(source, flags);
}

function buildMatch(filePath: string, allLines: string[], lineIdx: number, col: number): SearchTextMatch {
  const beforeStart = Math.max(ZERO, lineIdx - CONTEXT_LINES);
  const afterEnd = Math.min(allLines.length, lineIdx + CONTEXT_LINES + FIRST_LINE);
  return {
    path: filePath,
    line: lineIdx + FIRST_LINE,
    column: col + FIRST_LINE,
    content: allLines[lineIdx] ?? '',
    contextBefore: allLines.slice(beforeStart, lineIdx),
    contextAfter: allLines.slice(lineIdx + FIRST_LINE, afterEnd),
  };
}

interface SearchParams {
  content: string;
  filePath: string;
  pattern: string;
  isRegex: boolean;
  ignoreCase: boolean;
}

export function searchInContent(params: SearchParams): SearchTextMatch[] {
  const regex = buildRegex(params.pattern, params.isRegex, params.ignoreCase);
  const allLines = params.content.split('\n');
  const matches: SearchTextMatch[] = [];
  for (const [lineIdx, line] of allLines.entries()) {
    for (const match of line.matchAll(regex)) {
      matches.push(buildMatch(params.filePath, allLines, lineIdx, match.index));
    }
  }
  return matches;
}

// ─── Concurrency Pool ────────────────────────────────────────────────────────

export async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = ZERO;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += FIRST_LINE;
      const task = tasks[currentIndex];
      if (task !== undefined) {
        results[currentIndex] = await task();
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => runNext());
  await Promise.all(workers);
  return results;
}

// ─── Line Counting ───────────────────────────────────────────────────────────

export function countContentLines(content: string): number {
  if (content.length === ZERO) return ZERO;
  return content.split('\n').length;
}
