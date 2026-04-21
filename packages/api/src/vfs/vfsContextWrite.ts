// vfsContextWrite.ts — write-path operations for VFSContext
import type { DirtySetClient } from './dirtySet.js';
import type { StorageLayer } from './storageLayer.js';
import type { TreeIndex } from './treeIndex.js';
import type { CreateFileResult, DeleteFileResult, Edit, EditFileResult, RenameFileResult } from './types.js';
import { VFSError, VFSErrorCode } from './types.js';
import { applyEdits, countContentLines } from './vfsContextHelpers.js';
import type { ReadDeps } from './vfsContextRead.js';
import { resolveFileContent } from './vfsContextRead.js';

const FULL_CONTENT_COUNT = 1;
const EMPTY_LENGTH = 0;

export type WriteDeps = ReadDeps;

// ─── Persist tree + mark dirty ───────────────────────────────────────────────

async function persistTree(
  storageLayer: StorageLayer,
  dirtySet: DirtySetClient,
  treeIndex: TreeIndex,
  timestamp: number
): Promise<void> {
  await storageLayer.uploadTreeIndex(treeIndex.serialize());
  await dirtySet.markTreeDirty(timestamp);
}

// ─── Create File ─────────────────────────────────────────────────────────────

function assertNotExists(treeIndex: TreeIndex, path: string): void {
  if (treeIndex.exists(path)) {
    throw new VFSError(VFSErrorCode.ALREADY_EXISTS, `File already exists: ${path}`);
  }
}

export async function createFileOp(
  deps: WriteDeps,
  path: string,
  content: string
): Promise<CreateFileResult> {
  assertNotExists(deps.treeIndex, path);
  const timestamp = Date.now();
  deps.memoryLayer.set(path, content, timestamp);
  await deps.storageLayer.upload(path, content);
  await deps.dirtySet.markDirty(path, timestamp);
  const { length: sizeBytes } = new TextEncoder().encode(content);
  deps.treeIndex.addFile(path, sizeBytes);
  await persistTree(deps.storageLayer, deps.dirtySet, deps.treeIndex, timestamp);
  return { path, linesWritten: countContentLines(content) };
}

// ─── Edit File ───────────────────────────────────────────────────────────────

function assertExists(treeIndex: TreeIndex, path: string): void {
  if (!treeIndex.exists(path)) {
    throw new VFSError(VFSErrorCode.FILE_NOT_FOUND, `File not found: ${path}`);
  }
}

function validateEditParams(edits: Edit[] | undefined, fullContent: string | undefined): void {
  const hasEdits = edits !== undefined && edits.length > EMPTY_LENGTH;
  const hasFull = fullContent !== undefined;
  if (hasEdits && hasFull) {
    throw new VFSError(VFSErrorCode.INVALID_PARAMETER, 'Cannot provide both edits and fullContent');
  }
  if (!hasEdits && !hasFull) {
    throw new VFSError(VFSErrorCode.INVALID_PARAMETER, 'Must provide either edits or fullContent');
  }
}

function resolveNewContent(
  current: string,
  edits: Edit[] | undefined,
  fullContent: string | undefined
): string {
  if (fullContent !== undefined) return fullContent;
  if (edits !== undefined) return applyEdits(current, edits);
  return current;
}

async function writeEditedContent(deps: WriteDeps, path: string, newContent: string): Promise<void> {
  const timestamp = Date.now();
  deps.memoryLayer.set(path, newContent, timestamp);
  await deps.storageLayer.upload(path, newContent);
  await deps.dirtySet.markDirty(path, timestamp);
  const { length: sizeBytes } = new TextEncoder().encode(newContent);
  deps.treeIndex.updateFileSize(path, sizeBytes);
  await persistTree(deps.storageLayer, deps.dirtySet, deps.treeIndex, timestamp);
}

export async function editFileOp(
  deps: WriteDeps,
  path: string,
  edits: Edit[] | undefined,
  fullContent: string | undefined
): Promise<EditFileResult> {
  assertExists(deps.treeIndex, path);
  validateEditParams(edits, fullContent);
  const current = await resolveFileContent(deps, path);
  const newContent = resolveNewContent(current, edits, fullContent);
  await writeEditedContent(deps, path, newContent);
  const editsApplied = edits === undefined ? FULL_CONTENT_COUNT : edits.length;
  return { path, editsApplied, newLineCount: countContentLines(newContent) };
}

// ─── Delete File ─────────────────────────────────────────────────────────────

export async function deleteFileOp(deps: WriteDeps, path: string): Promise<DeleteFileResult> {
  assertExists(deps.treeIndex, path);
  const timestamp = Date.now();
  deps.memoryLayer.delete(path);
  await deps.storageLayer.delete(path);
  await deps.dirtySet.markDirty(path, timestamp);
  deps.treeIndex.removeFile(path);
  await persistTree(deps.storageLayer, deps.dirtySet, deps.treeIndex, timestamp);
  return { path, deleted: true };
}

// ─── Rename File ─────────────────────────────────────────────────────────────

function validateRenamePaths(treeIndex: TreeIndex, oldPath: string, newPath: string): void {
  assertExists(treeIndex, oldPath);
  assertNotExists(treeIndex, newPath);
}

async function moveInLayers(
  deps: WriteDeps,
  oldPath: string,
  newPath: string,
  timestamp: number
): Promise<void> {
  deps.memoryLayer.rename(oldPath, newPath);
  await deps.storageLayer.rename(oldPath, newPath);
  await deps.dirtySet.markDirty(oldPath, timestamp);
  await deps.dirtySet.markDirty(newPath, timestamp);
  deps.treeIndex.moveFile(oldPath, newPath);
}

export async function renameFileOp(
  deps: WriteDeps,
  oldPath: string,
  newPath: string
): Promise<RenameFileResult> {
  validateRenamePaths(deps.treeIndex, oldPath, newPath);
  const timestamp = Date.now();
  await moveInLayers(deps, oldPath, newPath, timestamp);
  await persistTree(deps.storageLayer, deps.dirtySet, deps.treeIndex, timestamp);
  return { oldPath, newPath };
}
