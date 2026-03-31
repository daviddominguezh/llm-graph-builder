import { describe, expect, it } from '@jest/globals';

import { TreeIndex } from '../treeIndex.js';
import type { TreeEntry } from '../types.js';

const UPDATED_AT = 1700000000000;
const SIZE_SMALL = 100;
const SIZE_LARGE = 5000;
const SIZE_UPDATED = 999;

// ─── updateFileSize ─────────────────────────────────────────────────────────

function describeUpdateFileSize(): void {
  it('updates the size of a file', () => {
    const idx = new TreeIndex();
    idx.load([{ path: 'src/a.ts', type: 'file', sizeBytes: SIZE_SMALL }], UPDATED_AT);
    idx.updateFileSize('src/a.ts', SIZE_UPDATED);
    const meta = idx.getMetadata('src/a.ts');
    expect(meta?.sizeBytes).toBe(SIZE_UPDATED);
  });

  it('is a no-op for directories', () => {
    const idx = new TreeIndex();
    idx.load([{ path: 'src', type: 'directory' }], UPDATED_AT);
    idx.updateFileSize('src', SIZE_UPDATED);
    expect(idx.getMetadata('src')).toBeNull();
  });

  it('is a no-op for non-existent paths', () => {
    const idx = new TreeIndex();
    idx.load([], UPDATED_AT);
    expect(() => {
      idx.updateFileSize('nope.ts', SIZE_UPDATED);
    }).not.toThrow();
  });
}

// ─── addFile creates parent directories ─────────────────────────────────────

function describeAddFileParents(): void {
  it('creates deeply nested parent directories', () => {
    const idx = new TreeIndex();
    idx.load([], UPDATED_AT);
    idx.addFile('a/b/c/d.ts', SIZE_SMALL);
    expect(idx.exists('a')).toBe(true);
    expect(idx.isDirectory('a')).toBe(true);
    expect(idx.exists('a/b')).toBe(true);
    expect(idx.isDirectory('a/b')).toBe(true);
    expect(idx.exists('a/b/c')).toBe(true);
    expect(idx.isDirectory('a/b/c')).toBe(true);
    expect(idx.exists('a/b/c/d.ts')).toBe(true);
    expect(idx.isDirectory('a/b/c/d.ts')).toBe(false);
  });
}

// ─── findFiles with exclude patterns ────────────────────────────────────────

function describeFindFilesExclude(): void {
  it('excludes files matching exclude patterns', () => {
    const idx = new TreeIndex();
    const entries: TreeEntry[] = [
      { path: 'src', type: 'directory' },
      { path: 'src/a.ts', type: 'file', sizeBytes: SIZE_SMALL },
      { path: 'src/b.test.ts', type: 'file', sizeBytes: SIZE_SMALL },
      { path: 'lib', type: 'directory' },
      { path: 'lib/c.ts', type: 'file', sizeBytes: SIZE_SMALL },
    ];
    idx.load(entries, UPDATED_AT);
    const files = idx.findFiles('**/*.ts', undefined, ['**/*.test.ts']);
    expect(files).toContain('src/a.ts');
    expect(files).toContain('lib/c.ts');
    expect(files).not.toContain('src/b.test.ts');
  });
}

// ─── listDirectory recursive with maxDepth ──────────────────────────────────

function describeListDirectoryMaxDepth(): void {
  it('respects maxDepth 1 — only immediate children', () => {
    const idx = new TreeIndex();
    const entries: TreeEntry[] = [
      { path: 'src', type: 'directory' },
      { path: 'src/utils', type: 'directory' },
      { path: 'src/utils/deep.ts', type: 'file', sizeBytes: SIZE_SMALL },
      { path: 'src/index.ts', type: 'file', sizeBytes: SIZE_SMALL },
    ];
    idx.load(entries, UPDATED_AT);
    const maxDepthOne = 1;
    const result = idx.listDirectory('src', true, maxDepthOne);
    const paths = result.map((e) => e.path);
    expect(paths).toContain('src/utils');
    expect(paths).toContain('src/index.ts');
    expect(paths).not.toContain('src/utils/deep.ts');
  });
}

// ─── getTree with maxDepth ──────────────────────────────────────────────────

function describeGetTreeMaxDepth(): void {
  it('respects maxDepth — no children beyond depth', () => {
    const idx = new TreeIndex();
    const entries: TreeEntry[] = [
      { path: 'src', type: 'directory' },
      { path: 'src/utils', type: 'directory' },
      { path: 'src/utils/helper.ts', type: 'file', sizeBytes: SIZE_SMALL },
    ];
    idx.load(entries, UPDATED_AT);
    const maxDepthOne = 1;
    const tree = idx.getTree('', maxDepthOne);
    const srcNode = tree?.children?.find((c) => c.name === 'src');
    expect(srcNode).toBeDefined();
    expect(srcNode?.children).toEqual([]);
  });
}

// ─── Empty tree ─────────────────────────────────────────────────────────────

function describeEmptyTree(): void {
  it('operations on unloaded tree return safe defaults', () => {
    const idx = new TreeIndex();
    expect(idx.isLoaded()).toBe(false);
    expect(idx.exists('anything')).toBe(false);
    expect(idx.isDirectory('anything')).toBe(false);
    expect(idx.getMetadata('anything')).toBeNull();
    expect(idx.findFiles('**/*')).toEqual([]);
    expect(idx.listDirectory('')).toEqual([]);
  });
}

// ─── Serialize/deserialize preserves all fields ─────────────────────────────

function describeSerializePreservesFields(): void {
  it('preserves sizeBytes and sha through round-trip', () => {
    const sha = 'abc123';
    const idx = new TreeIndex();
    const entries: TreeEntry[] = [{ path: 'f.ts', type: 'file', sizeBytes: SIZE_LARGE, sha }];
    idx.load(entries, UPDATED_AT);
    const json = idx.serialize();
    const restored = TreeIndex.deserialize(json, UPDATED_AT);
    expect(restored.exists('f.ts')).toBe(true);
    const meta = restored.getMetadata('f.ts');
    expect(meta?.sizeBytes).toBe(SIZE_LARGE);
  });

  it('preserves directory entries', () => {
    const idx = new TreeIndex();
    idx.load([{ path: 'src', type: 'directory' }], UPDATED_AT);
    const json = idx.serialize();
    const restored = TreeIndex.deserialize(json, UPDATED_AT);
    expect(restored.isDirectory('src')).toBe(true);
  });
}

// ─── Top-level describe ─────────────────────────────────────────────────────

describe('TreeIndex — updateFileSize', describeUpdateFileSize);
describe('TreeIndex — addFile parent dirs', describeAddFileParents);
describe('TreeIndex — findFiles exclude', describeFindFilesExclude);
describe('TreeIndex — listDirectory maxDepth', describeListDirectoryMaxDepth);
describe('TreeIndex — getTree maxDepth', describeGetTreeMaxDepth);
describe('TreeIndex — empty tree', describeEmptyTree);
describe('TreeIndex — serialize preserves fields', describeSerializePreservesFields);
