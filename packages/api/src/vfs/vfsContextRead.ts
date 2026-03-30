// vfsContextRead.ts — read-path operations for VFSContext
import type { DirtySetClient } from './dirtySet.js';
import type { MemoryLayer } from './memoryLayer.js';
import type { StorageLayer } from './storageLayer.js';
import type { TreeIndex } from './treeIndex.js';
import type {
  CountLinesResult,
  FileMetadataResult,
  FileTreeResult,
  FindFilesResult,
  ListDirectoryResult,
  ReadFileResult,
  SearchTextMatch,
  SearchTextParams,
  SearchTextResult,
  SourceProvider,
} from './types.js';
import { VFSError, VFSErrorCode } from './types.js';
import {
  countContentLines,
  estimateTokens,
  extractLineRange,
  isBinary,
  runWithConcurrency,
  searchInContent,
} from './vfsContextHelpers.js';

const DEFAULT_FIND_LIMIT = 200;
const DEFAULT_MAX_RESULTS = 100;
const TREE_MAX_DEPTH = 5;
const INITIAL_OFFSET = 0;

// ─── Shared content resolver ─────────────────────────────────────────────────

export interface ReadDeps {
  memoryLayer: MemoryLayer;
  storageLayer: StorageLayer;
  dirtySet: DirtySetClient;
  sourceProvider: SourceProvider;
  treeIndex: TreeIndex;
  rateLimitThreshold: number;
}

function checkMemoryFreshness(localUpdatedAt: number, dirtyTimestamp: number | null): boolean {
  return dirtyTimestamp === null || localUpdatedAt >= dirtyTimestamp;
}

async function fetchFromMemory(deps: ReadDeps, path: string): Promise<string | null> {
  const cached = deps.memoryLayer.get(path);
  if (cached === undefined) return null;
  const dirtyTs = await deps.dirtySet.getTimestamp(path);
  if (checkMemoryFreshness(cached.updatedAt, dirtyTs)) return cached.content;
  return null;
}

async function fetchFromStorage(deps: ReadDeps, path: string): Promise<string | null> {
  const content = await deps.storageLayer.download(path);
  if (content === null) return null;
  deps.memoryLayer.set(path, content, Date.now());
  return content;
}

function checkRateLimit(deps: ReadDeps): void {
  if (deps.sourceProvider.rateLimit.remaining < deps.rateLimitThreshold) {
    throw new VFSError(VFSErrorCode.RATE_LIMITED, 'Source provider rate limit approaching');
  }
}

async function fetchFromSource(deps: ReadDeps, path: string): Promise<string> {
  checkRateLimit(deps);
  if (!deps.treeIndex.exists(path)) {
    throw new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found: ${path}`);
  }
  const bytes = await deps.sourceProvider.fetchFileContent(path);
  if (isBinary(bytes)) {
    throw new VFSError(VFSErrorCode.BINARY_FILE, `Binary file: ${path}`);
  }
  const content = new TextDecoder().decode(bytes);
  deps.memoryLayer.set(path, content, Date.now());
  await deps.storageLayer.upload(path, content);
  return content;
}

export async function resolveFileContent(deps: ReadDeps, path: string): Promise<string> {
  const fromMemory = await fetchFromMemory(deps, path);
  if (fromMemory !== null) return fromMemory;
  const fromStorage = await fetchFromStorage(deps, path);
  if (fromStorage !== null) return fromStorage;
  return await fetchFromSource(deps, path);
}

// ─── Read Operations ─────────────────────────────────────────────────────────

export function buildReadResult(path: string, content: string, start?: number, end?: number): ReadFileResult {
  const range = extractLineRange(content, start, end);
  return {
    path,
    content: range.lines,
    startLine: range.startLine,
    endLine: range.endLine,
    totalLines: range.totalLines,
    tokenEstimate: estimateTokens(range.lines),
  };
}

export function enforceLineCeiling(content: string, path: string, ceiling: number): void {
  const totalLines = countContentLines(content);
  if (totalLines > ceiling) {
    throw new VFSError(VFSErrorCode.TOO_LARGE, `File exceeds ${ceiling} lines: ${path}`, {
      totalLines,
      tokenEstimate: estimateTokens(content),
    });
  }
}

// ─── List / Find / Metadata ──────────────────────────────────────────────────

export function listDirectoryFromTree(treeIndex: TreeIndex, path: string): ListDirectoryResult {
  const entries = treeIndex.listDirectory(path);
  return {
    path,
    entries: entries.map((e) => ({ name: e.path.split('/').pop() ?? e.path, type: e.type })),
  };
}

export function findFilesFromTree(treeIndex: TreeIndex, pattern: string, path?: string): FindFilesResult {
  const matches = treeIndex.findFiles(pattern, path);
  const truncated = matches.length > DEFAULT_FIND_LIMIT;
  const limited = truncated ? matches.slice(INITIAL_OFFSET, DEFAULT_FIND_LIMIT) : matches;
  return { pattern, matches: limited, totalMatches: matches.length, truncated };
}

export function getFileMetadataFromTree(
  treeIndex: TreeIndex,
  memoryLayer: MemoryLayer,
  path: string
): FileMetadataResult {
  const meta = treeIndex.getMetadata(path);
  if (meta === null) {
    throw new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found: ${path}`);
  }
  const cached = memoryLayer.get(path);
  const lineCount = cached === undefined ? null : countContentLines(cached.content);
  return {
    path,
    sizeBytes: meta.sizeBytes,
    lineCount,
    language: meta.language ?? 'unknown',
    isBinary: false,
  };
}

export function getFileTreeFromIndex(treeIndex: TreeIndex, path: string): FileTreeResult {
  const tree = treeIndex.getTree(path, TREE_MAX_DEPTH);
  if (tree === null) {
    throw new VFSError(VFSErrorCode.FILE_NOT_FOUND, `Path not found: ${path}`);
  }
  return { path, tree, truncated: false };
}

// ─── Count Lines ─────────────────────────────────────────────────────────────

export function buildCountLinesResult(path: string, content: string): CountLinesResult {
  return { path, totalLines: countContentLines(content) };
}

// ─── Search Text ─────────────────────────────────────────────────────────────

function filterCandidates(treeIndex: TreeIndex, params: SearchTextParams, candidateLimit: number): string[] {
  const pattern = params.includeGlob ?? '**/*';
  const candidates = treeIndex.findFiles(pattern, params.path);
  if (candidates.length > candidateLimit) {
    throw new VFSError(
      VFSErrorCode.TOO_LARGE,
      `Too many candidates: ${candidates.length} (limit ${candidateLimit})`
    );
  }
  return candidates;
}

function collectMatches(
  results: SearchTextMatch[][],
  maxResults: number
): { matches: SearchTextMatch[]; truncated: boolean } {
  const all: SearchTextMatch[] = results.flat();
  const truncated = all.length > maxResults;
  const limited = truncated ? all.slice(INITIAL_OFFSET, maxResults) : all;
  return { matches: limited, truncated };
}

function buildSearchTask(
  deps: ReadDeps,
  filePath: string,
  params: SearchTextParams
): () => Promise<SearchTextMatch[]> {
  return async (): Promise<SearchTextMatch[]> => {
    const content = await resolveFileContent(deps, filePath).catch(() => null);
    if (content === null) return [];
    return searchInContent({
      content,
      filePath,
      pattern: params.pattern,
      isRegex: params.isRegex ?? false,
      ignoreCase: params.ignoreCase ?? false,
    });
  };
}

export async function searchTextInFiles(
  deps: ReadDeps,
  params: SearchTextParams,
  candidateLimit: number,
  concurrency: number
): Promise<SearchTextResult> {
  const candidates = filterCandidates(deps.treeIndex, params, candidateLimit);
  const maxResults = params.maxResults ?? DEFAULT_MAX_RESULTS;
  const tasks = candidates.map((fp) => buildSearchTask(deps, fp, params));
  const results = await runWithConcurrency(tasks, concurrency);
  const { matches, truncated } = collectMatches(results, maxResults);
  return { pattern: params.pattern, matches, totalMatches: matches.length, truncated };
}
