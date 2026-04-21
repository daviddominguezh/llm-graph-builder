import { describe, expect, it } from '@jest/globals';

import { MemoryLayer } from '../memoryLayer.js';

const TIMESTAMP_A = 100;
const TIMESTAMP_B = 200;

function describeGetSet(): void {
  it('stores and retrieves files', () => {
    const layer = new MemoryLayer();
    layer.set('src/a.ts', 'content-a', TIMESTAMP_A);
    const file = layer.get('src/a.ts');
    expect(file).toEqual({ content: 'content-a', updatedAt: TIMESTAMP_A });
  });

  it('returns undefined for missing files', () => {
    const layer = new MemoryLayer();
    expect(layer.get('missing.ts')).toBeUndefined();
  });
}

function describeDelete(): void {
  it('deletes files', () => {
    const layer = new MemoryLayer();
    layer.set('a.ts', 'content', TIMESTAMP_A);
    expect(layer.delete('a.ts')).toBe(true);
    expect(layer.get('a.ts')).toBeUndefined();
    expect(layer.delete('a.ts')).toBe(false);
  });
}

function describeRename(): void {
  it('renames files', () => {
    const layer = new MemoryLayer();
    layer.set('old.ts', 'content', TIMESTAMP_A);
    expect(layer.rename('old.ts', 'new.ts')).toBe(true);
    expect(layer.get('old.ts')).toBeUndefined();
    expect(layer.get('new.ts')?.content).toBe('content');
  });

  it('rename returns false if source missing', () => {
    const layer = new MemoryLayer();
    expect(layer.rename('missing.ts', 'new.ts')).toBe(false);
  });
}

function describeQuery(): void {
  it('has() checks existence', () => {
    const layer = new MemoryLayer();
    layer.set('a.ts', 'content', TIMESTAMP_A);
    expect(layer.has('a.ts')).toBe(true);
    expect(layer.has('b.ts')).toBe(false);
  });

  it('paths() returns all cached paths', () => {
    const layer = new MemoryLayer();
    layer.set('a.ts', 'a', TIMESTAMP_A);
    layer.set('b.ts', 'b', TIMESTAMP_B);
    expect(layer.paths().sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('entries() iterates all cached files', () => {
    const layer = new MemoryLayer();
    layer.set('a.ts', 'a', TIMESTAMP_A);
    const entries = [...layer.entries()];
    const EXPECTED_LENGTH = 1;
    const FIRST_INDEX = 0;
    expect(entries).toHaveLength(EXPECTED_LENGTH);
    expect(entries[FIRST_INDEX]?.[FIRST_INDEX]).toBe('a.ts');
  });
}

describe('MemoryLayer', () => {
  describeGetSet();
  describeDelete();
  describeRename();
  describeQuery();
});
