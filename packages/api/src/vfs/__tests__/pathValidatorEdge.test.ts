import { describe, expect, it } from '@jest/globals';

import { validatePath, validateWritePath } from '../pathValidator.js';
import { VFSError } from '../types.js';

// ─── Unicode in paths ───────────────────────────────────────────────────────

function describeUnicodePaths(): void {
  it('allows unicode characters', () => {
    expect(() => {
      validatePath('src/日本語/file.ts');
    }).not.toThrow();
  });

  it('allows emoji in paths', () => {
    expect(() => {
      validatePath('docs/🎉/readme.md');
    }).not.toThrow();
  });
}

// ─── Spaces in paths ────────────────────────────────────────────────────────

function describeSpacePaths(): void {
  it('allows spaces in path', () => {
    expect(() => {
      validatePath('src/my file.ts');
    }).not.toThrow();
  });

  it('allows spaces in directory names', () => {
    expect(() => {
      validatePath('my project/src/app.ts');
    }).not.toThrow();
  });
}

// ─── Very long paths ────────────────────────────────────────────────────────

function describeLongPaths(): void {
  it('allows very long paths', () => {
    const segmentLength = 50;
    const segmentCount = 10;
    const longSegment = 'a'.repeat(segmentLength);
    const longPath = `${Array.from({ length: segmentCount }, () => longSegment).join('/')}/f.ts`;
    expect(() => {
      validatePath(longPath);
    }).not.toThrow();
  });
}

// ─── .git blocking rules ────────────────────────────────────────────────────

function describeGitBlocking(): void {
  it('blocks bare ".git" path', () => {
    expect(() => {
      validatePath('.git');
    }).toThrow(VFSError);
  });

  it('blocks .git/** paths', () => {
    expect(() => {
      validatePath('.git/config');
    }).toThrow(VFSError);
    expect(() => {
      validatePath('.git/objects/abc');
    }).toThrow(VFSError);
  });

  it('does NOT block .gitignore', () => {
    expect(() => {
      validatePath('.gitignore');
    }).not.toThrow();
  });

  it('does NOT block .gitattributes', () => {
    expect(() => {
      validatePath('.gitattributes');
    }).not.toThrow();
  });
}

// ─── Deeply nested .git ─────────────────────────────────────────────────────

function describeNestedGit(): void {
  it('does NOT block .git nested inside src', () => {
    expect(() => {
      validatePath('src/.git/config');
    }).not.toThrow();
  });

  it('does NOT block deeply nested .git', () => {
    expect(() => {
      validatePath('packages/api/.git/HEAD');
    }).not.toThrow();
  });
}

// ─── node_modules in read path ──────────────────────────────────────────────

function describeNodeModulesRead(): void {
  it('allows node_modules in read path', () => {
    expect(() => {
      validatePath('node_modules/lodash/index.js');
    }).not.toThrow();
  });

  it('blocks node_modules in write path by default', () => {
    expect(() => {
      validateWritePath('node_modules/lodash/index.js');
    }).toThrow(VFSError);
  });
}

// ─── Top-level describe ─────────────────────────────────────────────────────

describe('PathValidator — unicode paths', describeUnicodePaths);
describe('PathValidator — spaces in paths', describeSpacePaths);
describe('PathValidator — long paths', describeLongPaths);
describe('PathValidator — .git blocking', describeGitBlocking);
describe('PathValidator — nested .git', describeNestedGit);
describe('PathValidator — node_modules read', describeNodeModulesRead);
