import { describe, expect, it } from '@jest/globals';

import { TreeIndex } from '../treeIndex.js';
import type { TreeEntry } from '../types.js';

const SIZE_LOGIN = 8432;
const SIZE_LOGOUT = 1203;
const SIZE_INDEX = 540;
const SIZE_PACKAGE_JSON = 1822;
const SIZE_README = 3400;

const SAMPLE_ENTRIES: TreeEntry[] = [
  { path: 'src', type: 'directory' },
  { path: 'src/auth', type: 'directory' },
  { path: 'src/auth/login.ts', type: 'file', sizeBytes: SIZE_LOGIN, sha: 'abc123' },
  { path: 'src/auth/logout.ts', type: 'file', sizeBytes: SIZE_LOGOUT, sha: 'def456' },
  { path: 'src/index.ts', type: 'file', sizeBytes: SIZE_INDEX, sha: 'ghi789' },
  { path: 'package.json', type: 'file', sizeBytes: SIZE_PACKAGE_JSON, sha: 'jkl012' },
  { path: 'README.md', type: 'file', sizeBytes: SIZE_README, sha: 'mno345' },
];

const UPDATED_AT = 1700000000000;

function makeLoadedIndex(): TreeIndex {
  const idx = new TreeIndex();
  idx.load(SAMPLE_ENTRIES, UPDATED_AT);
  return idx;
}

function describeLoadAndIsLoaded(): void {
  it('is not loaded initially', () => {
    const idx = new TreeIndex();
    expect(idx.isLoaded()).toBe(false);
    expect(idx.getUpdatedAt()).toBeNull();
  });

  it('becomes loaded after load() and tracks updatedAt', () => {
    const idx = makeLoadedIndex();
    expect(idx.isLoaded()).toBe(true);
    expect(idx.getUpdatedAt()).toBe(UPDATED_AT);
  });
}

function describeExists(): void {
  it('returns true for known files', () => {
    const idx = makeLoadedIndex();
    expect(idx.exists('src/auth/login.ts')).toBe(true);
    expect(idx.exists('package.json')).toBe(true);
  });

  it('returns true for known directories', () => {
    const idx = makeLoadedIndex();
    expect(idx.exists('src')).toBe(true);
    expect(idx.exists('src/auth')).toBe(true);
  });

  it('returns false for unknown paths', () => {
    const idx = makeLoadedIndex();
    expect(idx.exists('src/missing.ts')).toBe(false);
  });
}

function describeIsDirectory(): void {
  it('returns true for directories', () => {
    const idx = makeLoadedIndex();
    expect(idx.isDirectory('src')).toBe(true);
    expect(idx.isDirectory('src/auth')).toBe(true);
  });

  it('returns false for files', () => {
    const idx = makeLoadedIndex();
    expect(idx.isDirectory('src/auth/login.ts')).toBe(false);
    expect(idx.isDirectory('package.json')).toBe(false);
  });

  it('returns false for non-existent paths', () => {
    const idx = makeLoadedIndex();
    expect(idx.isDirectory('nonexistent')).toBe(false);
  });
}

function describeGetMetadata(): void {
  it('returns size and language for .ts files', () => {
    const idx = makeLoadedIndex();
    const meta = idx.getMetadata('src/auth/login.ts');
    expect(meta).toEqual({ sizeBytes: SIZE_LOGIN, language: 'typescript' });
  });

  it('returns null for directories', () => {
    const idx = makeLoadedIndex();
    expect(idx.getMetadata('src')).toBeNull();
  });

  it('returns null for non-existent paths', () => {
    const idx = makeLoadedIndex();
    expect(idx.getMetadata('nonexistent.ts')).toBeNull();
  });
}

function describeFindFiles(): void {
  it('matches .ts files with **/*.ts glob', () => {
    const idx = makeLoadedIndex();
    const files = idx.findFiles('**/*.ts');
    expect(files).toContain('src/auth/login.ts');
    expect(files).toContain('src/auth/logout.ts');
    expect(files).toContain('src/index.ts');
    expect(files).not.toContain('package.json');
  });

  it('scopes search to a subdirectory', () => {
    const idx = makeLoadedIndex();
    const files = idx.findFiles('**/*.ts', 'src/auth');
    expect(files).toContain('src/auth/login.ts');
    expect(files).toContain('src/auth/logout.ts');
    expect(files).not.toContain('src/index.ts');
  });

  it('respects exclude patterns', () => {
    const idx = makeLoadedIndex();
    const files = idx.findFiles('**/*.ts', undefined, ['src/auth/**']);
    expect(files).toContain('src/index.ts');
    expect(files).not.toContain('src/auth/login.ts');
  });
}

const SIZE_NEW_FILE = 200;
const SIZE_NEW_FEATURE = 100;

function describeAddFile(): void {
  it('adds a new file to the index', () => {
    const idx = makeLoadedIndex();
    idx.addFile('src/utils.ts', SIZE_NEW_FILE);
    expect(idx.exists('src/utils.ts')).toBe(true);
    expect(idx.isDirectory('src/utils.ts')).toBe(false);
  });

  it('auto-creates parent directories', () => {
    const idx = makeLoadedIndex();
    idx.addFile('src/new/feature.ts', SIZE_NEW_FEATURE);
    expect(idx.exists('src/new')).toBe(true);
    expect(idx.isDirectory('src/new')).toBe(true);
  });
}

function describeRemoveFile(): void {
  it('removes a file from the index', () => {
    const idx = makeLoadedIndex();
    idx.removeFile('src/auth/login.ts');
    expect(idx.exists('src/auth/login.ts')).toBe(false);
  });

  it('is a no-op for non-existent files', () => {
    const idx = makeLoadedIndex();
    expect(() => {
      idx.removeFile('does/not/exist.ts');
    }).not.toThrow();
  });
}

function describeMoveFile(): void {
  it('moves a file to a new path', () => {
    const idx = makeLoadedIndex();
    idx.moveFile('src/auth/login.ts', 'src/auth/signin.ts');
    expect(idx.exists('src/auth/login.ts')).toBe(false);
    expect(idx.exists('src/auth/signin.ts')).toBe(true);
  });
}

function describeSerializeDeserialize(): void {
  it('round-trips through serialize/deserialize', () => {
    const idx = makeLoadedIndex();
    const json = idx.serialize();
    const restored = TreeIndex.deserialize(json, UPDATED_AT);
    expect(restored.isLoaded()).toBe(true);
    expect(restored.exists('src/auth/login.ts')).toBe(true);
    expect(restored.exists('package.json')).toBe(true);
    expect(restored.getUpdatedAt()).toBe(UPDATED_AT);
  });
}

function describeListDirectory(): void {
  it('lists root-level children only by default', () => {
    const idx = makeLoadedIndex();
    const entries = idx.listDirectory('');
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('src');
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).not.toContain('src/auth/login.ts');
  });

  it('lists direct children of a directory', () => {
    const idx = makeLoadedIndex();
    const entries = idx.listDirectory('src');
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('src/auth');
    expect(paths).toContain('src/index.ts');
    expect(paths).not.toContain('src/auth/login.ts');
  });

  const LIST_MAX_DEPTH = 2;

  it('lists recursively up to maxDepth', () => {
    const idx = makeLoadedIndex();
    const entries = idx.listDirectory('src', true, LIST_MAX_DEPTH);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('src/auth');
    expect(paths).toContain('src/auth/login.ts');
    expect(paths).toContain('src/index.ts');
  });
}

function describeGetTree(): void {
  it('returns a nested tree structure', () => {
    const idx = makeLoadedIndex();
    const tree = idx.getTree();
    expect(tree).not.toBeNull();
    expect(tree?.name).toBe('');
    expect(tree?.children).toBeDefined();
    const srcNode = tree?.children?.find((c) => c.name === 'src');
    expect(srcNode).toBeDefined();
    expect(srcNode?.type).toBe('directory');
  });

  it('returns null for non-existent paths', () => {
    const idx = makeLoadedIndex();
    expect(idx.getTree('nonexistent')).toBeNull();
  });
}

const SIZE_IGNORED_JS = 100;
const SIZE_IGNORED_HEAD = 20;

function describeDefaultIgnores(): void {
  it('filters out ignored paths at load time', () => {
    const entriesWithIgnored: TreeEntry[] = [
      ...SAMPLE_ENTRIES,
      { path: 'node_modules', type: 'directory' },
      { path: 'node_modules/lodash', type: 'directory' },
      { path: 'node_modules/lodash/index.js', type: 'file', sizeBytes: SIZE_IGNORED_JS },
      { path: '.git', type: 'directory' },
      { path: '.git/HEAD', type: 'file', sizeBytes: SIZE_IGNORED_HEAD },
    ];
    const idx = new TreeIndex();
    idx.load(entriesWithIgnored, UPDATED_AT);
    expect(idx.exists('node_modules')).toBe(false);
    expect(idx.exists('node_modules/lodash/index.js')).toBe(false);
    expect(idx.exists('.git')).toBe(false);
    expect(idx.exists('.git/HEAD')).toBe(false);
    expect(idx.exists('src/auth/login.ts')).toBe(true);
  });
}

describe('TreeIndex', () => {
  describe('load + isLoaded', describeLoadAndIsLoaded);
  describe('exists', describeExists);
  describe('isDirectory', describeIsDirectory);
  describe('getMetadata', describeGetMetadata);
  describe('findFiles', describeFindFiles);
  describe('addFile', describeAddFile);
  describe('removeFile', describeRemoveFile);
  describe('moveFile', describeMoveFile);
  describe('serialize + deserialize', describeSerializeDeserialize);
  describe('listDirectory', describeListDirectory);
  describe('getTree', describeGetTree);
  describe('default ignores', describeDefaultIgnores);
});
