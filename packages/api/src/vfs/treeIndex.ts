// treeIndex.ts — lazy file tree with glob, mutations, and serialization
import picomatch from 'picomatch';

import { buildNestedTree, inferLanguage, shouldIgnore } from './treeIndexHelpers.js';
import type { TreeEntry, TreeNode } from './types.js';

const DEFAULT_MAX_DEPTH = 2;
const ROOT_PATH = '';
const SEPARATOR = '/';
const DEPTH_ONE = 1;
const EMPTY = 0;

// ─── Serialization ────────────────────────────────────────────────────────────

interface SerializedData {
  entries: TreeEntry[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function ensureParentDirs(flatEntries: Map<string, TreeEntry>, filePath: string): void {
  const segments = filePath.split(SEPARATOR);
  segments.pop(); // remove filename

  let current = '';
  for (const segment of segments) {
    current = current === '' ? segment : `${current}${SEPARATOR}${segment}`;
    if (!flatEntries.has(current)) {
      flatEntries.set(current, { path: current, type: 'directory' });
    }
  }
}

function matchesGlob(path: string, pattern: string): boolean {
  return picomatch(pattern)(path);
}

function matchesAnyGlob(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesGlob(path, p));
}

function isUnderPath(entryPath: string, scopePath: string): boolean {
  if (scopePath === ROOT_PATH || scopePath === '') return true;
  return entryPath.startsWith(`${scopePath}${SEPARATOR}`) || entryPath === scopePath;
}

function filterEntries(
  flatEntries: Map<string, TreeEntry>,
  pattern: string,
  scopePath: string | undefined,
  exclude: string[]
): string[] {
  const results: string[] = [];
  const scope = scopePath ?? ROOT_PATH;

  for (const entry of flatEntries.values()) {
    if (entry.type !== 'file') continue;
    if (!isUnderPath(entry.path, scope)) continue;
    if (exclude.length > EMPTY && matchesAnyGlob(entry.path, exclude)) continue;
    if (matchesGlob(entry.path, pattern)) {
      results.push(entry.path);
    }
  }

  return results.sort();
}

function isDirectChildOf(entryPath: string, dirPath: string): boolean {
  if (!isUnderPath(entryPath, dirPath)) return false;
  if (entryPath === dirPath) return false;
  const remainder = dirPath === '' ? entryPath : entryPath.slice(dirPath.length + DEPTH_ONE);
  return !remainder.includes(SEPARATOR);
}

function getDirectChildren(flatEntries: Map<string, TreeEntry>, dirPath: string): TreeEntry[] {
  const results: TreeEntry[] = [];
  for (const entry of flatEntries.values()) {
    if (isDirectChildOf(entry.path, dirPath)) {
      results.push(entry);
    }
  }
  return results;
}

function getDepthRelativeTo(entryPath: string, dirPath: string): number {
  if (dirPath === '') return entryPath.split(SEPARATOR).length;
  return entryPath.slice(dirPath.length + DEPTH_ONE).split(SEPARATOR).length;
}

function getRecursiveChildren(
  flatEntries: Map<string, TreeEntry>,
  dirPath: string,
  maxDepth: number
): TreeEntry[] {
  const results: TreeEntry[] = [];

  for (const entry of flatEntries.values()) {
    if (entry.path === dirPath) continue;
    if (!isUnderPath(entry.path, dirPath)) continue;
    const depth = getDepthRelativeTo(entry.path, dirPath);
    if (depth <= maxDepth) {
      results.push(entry);
    }
  }

  return results;
}

function isSerializedData(raw: unknown): raw is SerializedData {
  return typeof raw === 'object' && raw !== null && 'entries' in raw;
}

function parseSerializedData(data: string): SerializedData {
  const raw: unknown = JSON.parse(data);
  if (!isSerializedData(raw)) {
    throw new Error('Invalid serialized TreeIndex data');
  }
  return raw;
}

// ─── TreeIndex ────────────────────────────────────────────────────────────────

export class TreeIndex {
  private readonly flatEntries: Map<string, TreeEntry> = new Map<string, TreeEntry>();
  private tree: TreeNode | null = null;
  private loaded = false;
  private updatedAt: number | null = null;

  isLoaded(): boolean {
    return this.loaded;
  }

  getUpdatedAt(): number | null {
    return this.updatedAt;
  }

  load(entries: TreeEntry[], updatedAt: number): void {
    this.flatEntries.clear();
    for (const entry of entries) {
      if (!shouldIgnore(entry.path)) {
        this.flatEntries.set(entry.path, entry);
      }
    }
    this.updatedAt = updatedAt;
    this.loaded = true;
    this.rebuildTree();
  }

  exists(path: string): boolean {
    return this.flatEntries.has(path);
  }

  isDirectory(path: string): boolean {
    return this.flatEntries.get(path)?.type === 'directory';
  }

  getMetadata(path: string): { sizeBytes?: number; language?: string } | null {
    const entry = this.flatEntries.get(path);
    if (entry === undefined || entry.type === 'directory') return null;
    return {
      sizeBytes: entry.sizeBytes,
      language: inferLanguage(entry.path),
    };
  }

  findFiles(pattern: string, path?: string, exclude: string[] = []): string[] {
    return filterEntries(this.flatEntries, pattern, path, exclude);
  }

  listDirectory(path: string, recursive = false, maxDepth = DEFAULT_MAX_DEPTH): TreeEntry[] {
    if (recursive) {
      return getRecursiveChildren(this.flatEntries, path, maxDepth);
    }
    return getDirectChildren(this.flatEntries, path);
  }

  getTree(path = ROOT_PATH, maxDepth = DEFAULT_MAX_DEPTH): TreeNode | null {
    if (path !== ROOT_PATH && !this.flatEntries.has(path)) return null;
    return buildNestedTree(this.flatEntries, path, maxDepth);
  }

  addFile(path: string, sizeBytes: number): void {
    ensureParentDirs(this.flatEntries, path);
    this.flatEntries.set(path, { path, type: 'file', sizeBytes });
    this.rebuildTree();
  }

  removeFile(path: string): void {
    this.flatEntries.delete(path);
    this.rebuildTree();
  }

  moveFile(oldPath: string, newPath: string): void {
    const entry = this.flatEntries.get(oldPath);
    if (entry === undefined) return;
    this.flatEntries.delete(oldPath);
    ensureParentDirs(this.flatEntries, newPath);
    this.flatEntries.set(newPath, { ...entry, path: newPath });
    this.rebuildTree();
  }

  updateFileSize(path: string, sizeBytes: number): void {
    const entry = this.flatEntries.get(path);
    if (entry?.type !== 'file') return;
    this.flatEntries.set(path, { ...entry, sizeBytes });
  }

  serialize(): string {
    const entries = [...this.flatEntries.values()];
    const data: SerializedData = { entries };
    return JSON.stringify(data);
  }

  static deserialize(data: string, updatedAt: number): TreeIndex {
    const parsed = parseSerializedData(data);
    const idx = new TreeIndex();
    for (const entry of parsed.entries) {
      idx.flatEntries.set(entry.path, entry);
    }
    idx.updatedAt = updatedAt;
    idx.loaded = true;
    idx.rebuildTree();
    return idx;
  }

  private rebuildTree(): void {
    this.tree = buildNestedTree(this.flatEntries, ROOT_PATH, DEFAULT_MAX_DEPTH);
  }
}
