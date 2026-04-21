// searchSymbol.ts — search_symbol tool: finds symbol definitions across files
import type { Tool } from 'ai';
import { tool } from 'ai';

import type { SymbolMatch } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import type { SearchSymbolInput } from './schemas.js';
import { SearchSymbolSchema } from './schemas.js';
import { findSymbolsInContent } from './symbolPatterns.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

// ─── Language inference ───────────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
};

const DOT_NOT_FOUND = -1;
const AFTER_DOT = 1;

function inferLanguageFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === DOT_NOT_FOUND) return 'unknown';
  const ext = filePath.slice(dot + AFTER_DOT).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}

// ─── Core search logic ────────────────────────────────────────────────────────

async function searchFileForSymbols(
  vfs: VFSContext,
  filePath: string,
  name: string,
  kind: string
): Promise<SymbolMatch[]> {
  const language = inferLanguageFromPath(filePath);
  if (language === 'unknown') return [];

  const fileResult = await vfs.readFile(filePath);
  const matches = findSymbolsInContent(fileResult.content, language, name, kind);
  return matches.map((m) => ({ ...m, path: filePath }));
}

async function searchSymbols(
  vfs: VFSContext,
  name: string,
  kind: string,
  path: string | undefined
): Promise<SymbolMatch[]> {
  const findResult = await vfs.findFiles('**/*', path);
  const tasks = findResult.matches.map(async (fp) => await searchFileForSymbols(vfs, fp, name, kind));
  const results = await Promise.all(tasks);
  return results.flat();
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createSearchSymbolTool(vfs: VFSContext): Tool<SearchSymbolInput> {
  return tool({
    description: 'Find function, class, or type definitions by name.',
    inputSchema: SearchSymbolSchema,
    execute: async (data: SearchSymbolInput, { toolCallId }) => {
      try {
        const matches = await searchSymbols(vfs, data.name, data.kind, data.path);
        return toToolSuccess(toolCallId, VFSTool.search_symbol, { name: data.name, matches });
      } catch (error) {
        if (error instanceof VFSError) return toToolError(toolCallId, VFSTool.search_symbol, error);
        throw error;
      }
    },
  });
}
