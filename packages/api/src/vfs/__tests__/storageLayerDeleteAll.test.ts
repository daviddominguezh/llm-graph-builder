import { beforeEach, describe, expect, it } from '@jest/globals';

import type { StorageFileObject } from '../types.js';
import { VFSError, VFSErrorCode } from '../types.js';
import type { StorageTestContext } from './storageLayerMocks.js';
import { LIST_ERR_MSG, LIST_PAGE_SIZE, PREFIX, REMOVE_ERR_MSG, createTestContext } from './storageLayerMocks.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const FIRST_CALL = 0;
const SECOND_CALL = 1;
const EXPECTED_TWO_LIST_CALLS = 2;

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFileItem(name: string, id: string): StorageFileObject {
  return { name, id };
}

function makeFolderItem(name: string): StorageFileObject {
  return { name, id: null };
}

function makeFullPage(): StorageFileObject[] {
  return Array.from({ length: LIST_PAGE_SIZE }, (_, i) =>
    makeFileItem(`file-${String(i)}.ts`, `id-${String(i)}`)
  );
}

function assertProviderError(err: unknown): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(VFSErrorCode.PROVIDER_ERROR);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

function describeEmpty(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('does not call remove when no files exist', async () => {
    ctx.bucket.list.mockResolvedValue({ data: [], error: null });
    await ctx.storage.deleteAll();
    expect(ctx.bucket.remove).not.toHaveBeenCalled();
  });

  it('does not call remove when data is null', async () => {
    ctx.bucket.list.mockResolvedValue({ data: null, error: null });
    await ctx.storage.deleteAll();
    expect(ctx.bucket.remove).not.toHaveBeenCalled();
  });
}

function describeWithFiles(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('lists files and calls remove with their full paths', async () => {
    ctx.bucket.list.mockResolvedValue({
      data: [makeFileItem('file1.ts', 'id-1'), makeFileItem('file2.ts', 'id-2')],
      error: null,
    });
    await ctx.storage.deleteAll();
    expect(ctx.bucket.list).toHaveBeenCalledWith(PREFIX, expect.objectContaining({ limit: LIST_PAGE_SIZE }));
    expect(ctx.bucket.remove).toHaveBeenCalledWith([`${PREFIX}/file1.ts`, `${PREFIX}/file2.ts`]);
  });
}

function describeRecursive(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('recurses into pseudo-folders (id === null)', async () => {
    ctx.bucket.list
      .mockResolvedValueOnce({ data: [makeFolderItem('subfolder')], error: null })
      .mockResolvedValueOnce({ data: [makeFileItem('nested.ts', 'id-3')], error: null });
    await ctx.storage.deleteAll();
    expect(ctx.bucket.list).toHaveBeenCalledTimes(EXPECTED_TWO_LIST_CALLS);
    expect(ctx.bucket.list.mock.calls[FIRST_CALL]).toEqual([
      PREFIX,
      expect.objectContaining({ limit: LIST_PAGE_SIZE }),
    ]);
    expect(ctx.bucket.list.mock.calls[SECOND_CALL]).toEqual([
      `${PREFIX}/subfolder`,
      expect.objectContaining({ limit: LIST_PAGE_SIZE }),
    ]);
    expect(ctx.bucket.remove).toHaveBeenCalledWith([`${PREFIX}/subfolder/nested.ts`]);
  });
}

function describePagination(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('fetches next page when current page is full', async () => {
    ctx.bucket.list
      .mockResolvedValueOnce({ data: makeFullPage(), error: null })
      .mockResolvedValueOnce({ data: [makeFileItem('extra.ts', 'id-extra')], error: null });
    await ctx.storage.deleteAll();
    expect(ctx.bucket.list).toHaveBeenCalledTimes(EXPECTED_TWO_LIST_CALLS);
    expect(ctx.bucket.list.mock.calls[SECOND_CALL]).toEqual([
      PREFIX,
      expect.objectContaining({ limit: LIST_PAGE_SIZE, offset: LIST_PAGE_SIZE }),
    ]);
  });
}

function describeBatchRemoveError(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('throws VFSError when batch remove fails', async () => {
    ctx.bucket.list.mockResolvedValue({ data: [makeFileItem('file1.ts', 'id-1')], error: null });
    ctx.bucket.remove.mockResolvedValue({ data: null, error: { message: REMOVE_ERR_MSG } });
    try {
      await ctx.storage.deleteAll();
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

function describeListError(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('throws VFSError when listing fails', async () => {
    ctx.bucket.list.mockResolvedValue({ data: null, error: { message: LIST_ERR_MSG } });
    try {
      await ctx.storage.deleteAll();
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('StorageLayer.deleteAll', () => {
  describe('empty', describeEmpty);
  describe('with files', describeWithFiles);
  describe('recursive folders', describeRecursive);
  describe('pagination', describePagination);
  describe('batch remove error', describeBatchRemoveError);
  describe('list error', describeListError);
});
