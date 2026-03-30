// vfsContextWriteTypes.ts — shared dependency types for write operations
import type { DirtySetClient } from './dirtySet.js';
import type { MemoryLayer } from './memoryLayer.js';
import type { StorageLayer } from './storageLayer.js';
import type { TreeIndex } from './treeIndex.js';
import type { SourceProvider } from './types.js';

export interface WriteDeps {
  memoryLayer: MemoryLayer;
  storageLayer: StorageLayer;
  dirtySet: DirtySetClient;
  sourceProvider: SourceProvider;
  treeIndex: TreeIndex;
  rateLimitThreshold: number;
}
