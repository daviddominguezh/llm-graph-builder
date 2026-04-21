import type { CachedFile } from './types.js';

export class MemoryLayer {
  private readonly files = new Map<string, CachedFile>();

  get(path: string): CachedFile | undefined {
    return this.files.get(path);
  }

  set(path: string, content: string, updatedAt: number): void {
    this.files.set(path, { content, updatedAt });
  }

  delete(path: string): boolean {
    return this.files.delete(path);
  }

  rename(oldPath: string, newPath: string): boolean {
    const file = this.files.get(oldPath);
    if (file === undefined) return false;
    this.files.delete(oldPath);
    this.files.set(newPath, file);
    return true;
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  paths(): string[] {
    return [...this.files.keys()];
  }

  entries(): IterableIterator<[string, CachedFile]> {
    return this.files.entries();
  }
}
