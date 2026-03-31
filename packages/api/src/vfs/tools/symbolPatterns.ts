// symbolPatterns.ts — regex heuristics for finding symbol definitions per language
import type { SymbolMatch } from '../types.js';

export interface SymbolPattern {
  kind: string;
  regex: RegExp;
}

// ─── JS/TS Patterns ───────────────────────────────────────────────────────────

const JS_TS_PATTERNS: readonly SymbolPattern[] = [
  { kind: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(?<name>\w+)/v },
  { kind: 'function', regex: /^\s*(?:export\s+)?const\s+(?<name>\w+)\s*=\s*(?:async\s+)?\(/v },
  {
    kind: 'function',
    regex: /^\s*(?:export\s+)?const\s+(?<name>\w+)\s*=\s*(?:async\s+)?(?:\([^\)]*\)|[^=])\s*=>/v,
  },
  { kind: 'class', regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(?<name>\w+)/v },
  { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+(?<name>\w+)/v },
  { kind: 'type', regex: /^\s*(?:export\s+)?type\s+(?<name>\w+)\s*[=<]/v },
  { kind: 'variable', regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(?<name>\w+)\s*[=:]/v },
];

// ─── Python Patterns ──────────────────────────────────────────────────────────

const PYTHON_PATTERNS: readonly SymbolPattern[] = [
  { kind: 'function', regex: /^\s*(?:async\s+)?def\s+(?<name>\w+)/v },
  { kind: 'class', regex: /^\s*class\s+(?<name>\w+)/v },
  { kind: 'variable', regex: /^(?<name>\w+)\s*=/v },
];

// ─── Go Patterns ──────────────────────────────────────────────────────────────

const GO_PATTERNS: readonly SymbolPattern[] = [
  { kind: 'function', regex: /^func\s+(?:\([^\)]+\)\s+)?(?<name>\w+)/v },
  { kind: 'type', regex: /^type\s+(?<name>\w+)\s+(?:struct|interface)/v },
  { kind: 'variable', regex: /^(?:var|const)\s+(?<name>\w+)/v },
];

const PATTERNS_BY_LANGUAGE: Record<string, readonly SymbolPattern[]> = {
  typescript: JS_TS_PATTERNS,
  javascript: JS_TS_PATTERNS,
  python: PYTHON_PATTERNS,
  go: GO_PATTERNS,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLanguagePatterns(language: string): readonly SymbolPattern[] {
  return PATTERNS_BY_LANGUAGE[language] ?? [];
}

function nameMatchesPrefix(captured: string, prefix: string): boolean {
  return captured.toLowerCase().startsWith(prefix.toLowerCase());
}

function matchLine(
  line: string,
  lineNumber: number,
  patterns: readonly SymbolPattern[],
  name: string
): SymbolMatch | null {
  for (const pattern of patterns) {
    const match = pattern.regex.exec(line);
    const captured = match?.groups?.name;
    if (captured !== undefined && nameMatchesPrefix(captured, name)) {
      return { path: '', line: lineNumber, kind: pattern.kind, signature: line.trim() };
    }
  }
  return null;
}

const LINE_NUMBER_OFFSET = 1;

function collectMatches(
  lines: string[],
  patterns: readonly SymbolPattern[],
  name: string
): SymbolMatch[] {
  const results: SymbolMatch[] = [];
  for (const [idx, line] of lines.entries()) {
    const match = matchLine(line, idx + LINE_NUMBER_OFFSET, patterns, name);
    if (match !== null) results.push(match);
  }
  return results;
}

export function findSymbolsInContent(
  content: string,
  language: string,
  name: string,
  kind: string
): SymbolMatch[] {
  const allPatterns = getLanguagePatterns(language);
  const patterns = kind === 'any' ? allPatterns : allPatterns.filter((p) => p.kind === kind);
  return collectMatches(content.split('\n'), patterns, name);
}
