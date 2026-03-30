// vfsContextTree.ts — tree freshness logic for VFSContext
import type { DirtySetClient } from './dirtySet.js';
import type { StorageLayer } from './storageLayer.js';
import { TreeIndex } from './treeIndex.js';
import type { SourceProvider } from './types.js';
import { VFSError, VFSErrorCode } from './types.js';

interface TreeDeps {
  storageLayer: StorageLayer;
  dirtySet: DirtySetClient;
  sourceProvider: SourceProvider;
  rateLimitThreshold: number;
}

// ─── Load tree from source provider ─────────────────────────────────────────

function checkRateLimitForTree(deps: TreeDeps): void {
  if (deps.sourceProvider.rateLimit.remaining < deps.rateLimitThreshold) {
    throw new VFSError(VFSErrorCode.RATE_LIMITED, 'Source provider rate limit approaching');
  }
}

async function loadTreeFromSource(deps: TreeDeps): Promise<TreeIndex> {
  checkRateLimitForTree(deps);
  const entries = await deps.sourceProvider.fetchTree();
  const tree = new TreeIndex();
  const now = Date.now();
  tree.load(entries, now);
  await deps.storageLayer.uploadTreeIndex(tree.serialize());
  await deps.dirtySet.markTreeDirty(now);
  return tree;
}

// ─── Load tree from storage ──────────────────────────────────────────────────

function deserializeTree(data: string, updatedAt: number): TreeIndex {
  return TreeIndex.deserialize(data, updatedAt);
}

async function loadTreeFromStorage(deps: TreeDeps): Promise<TreeIndex | null> {
  const data = await deps.storageLayer.downloadTreeIndex();
  if (data === null) return null;
  return deserializeTree(data, Date.now());
}

// ─── Initial load ────────────────────────────────────────────────────────────

async function loadInitialTree(deps: TreeDeps): Promise<TreeIndex> {
  const fromStorage = await loadTreeFromStorage(deps);
  if (fromStorage !== null) return fromStorage;
  return await loadTreeFromSource(deps);
}

// ─── Stale check ─────────────────────────────────────────────────────────────

function isTreeCurrent(tree: TreeIndex, dirtyTimestamp: number | null): boolean {
  if (dirtyTimestamp === null) return true;
  const localTs = tree.getUpdatedAt();
  return localTs !== null && localTs >= dirtyTimestamp;
}

async function refreshStaleTree(deps: TreeDeps, dirtyTimestamp: number): Promise<TreeIndex | null> {
  const data = await deps.storageLayer.downloadTreeIndex();
  if (data === null) return null;
  return deserializeTree(data, dirtyTimestamp);
}

// ─── Public ensureTreeFresh ──────────────────────────────────────────────────

export async function ensureTreeFresh(currentTree: TreeIndex | null, deps: TreeDeps): Promise<TreeIndex> {
  if (currentTree?.isLoaded() !== true) {
    return await loadInitialTree(deps);
  }
  const dirtyTimestamp = await deps.dirtySet.getTreeTimestamp();
  if (isTreeCurrent(currentTree, dirtyTimestamp)) {
    return currentTree;
  }
  const refreshed = await refreshStaleTree(deps, dirtyTimestamp ?? Date.now());
  return refreshed ?? currentTree;
}
