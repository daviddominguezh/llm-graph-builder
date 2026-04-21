import { beforeEach, describe, expect, it } from '@jest/globals';

import { VFSError, VFSErrorCode } from '../types.js';
import type { StorageTestContext } from './storageLayerMocks.js';
import {
  COPY_ERR_MSG,
  DELETE_ERR_MSG,
  DOWNLOAD_ERR_MSG,
  FILE_CONTENT,
  FILE_PATH,
  NEW_PATH,
  NOT_FOUND_MSG,
  NOT_FOUND_STATUS,
  REMOVE_ERR_MSG,
  SERVER_ERR_STATUS,
  TREE_INDEX_DATA,
  TREE_INDEX_FILE,
  UPLOAD_ERR_MSG,
  createTestContext,
  fullPath,
} from './storageLayerMocks.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertProviderError(err: unknown): void {
  expect(err).toBeInstanceOf(VFSError);
  if (err instanceof VFSError) {
    expect(err.code).toBe(VFSErrorCode.PROVIDER_ERROR);
  }
}

// ─── Upload ─────────────────────────────────────────────────────────────────

function describeUpload(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('calls bucket.upload with correct prefix, contentType and upsert', async () => {
    await ctx.storage.upload(FILE_PATH, FILE_CONTENT);
    expect(ctx.bucket.upload).toHaveBeenCalledWith(fullPath(FILE_PATH), FILE_CONTENT, {
      contentType: 'text/plain',
      upsert: true,
    });
  });

  it('throws VFSError with PROVIDER_ERROR on upload failure', async () => {
    ctx.bucket.upload.mockResolvedValue({ data: null, error: { message: UPLOAD_ERR_MSG } });
    try {
      await ctx.storage.upload(FILE_PATH, FILE_CONTENT);
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

// ─── Download ───────────────────────────────────────────────────────────────

function describeDownloadHappy(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('calls bucket.download and returns content as string', async () => {
    const result = await ctx.storage.download(FILE_PATH);
    expect(ctx.bucket.download).toHaveBeenCalledWith(fullPath(FILE_PATH));
    expect(result).toBe(FILE_CONTENT);
  });
}

function describeDownloadNullData(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('returns null when data is null and there is no error', async () => {
    ctx.bucket.download.mockResolvedValue({ data: null, error: null });
    const result = await ctx.storage.download(FILE_PATH);
    expect(result).toBeNull();
  });
}

function describeDownloadNotFound(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('returns null when error has 404 statusCode', async () => {
    ctx.bucket.download.mockResolvedValue({
      data: null,
      error: { message: 'Not Found', statusCode: NOT_FOUND_STATUS },
    });
    expect(await ctx.storage.download(FILE_PATH)).toBeNull();
  });

  it('returns null when error message contains "not found"', async () => {
    ctx.bucket.download.mockResolvedValue({ data: null, error: { message: NOT_FOUND_MSG } });
    expect(await ctx.storage.download(FILE_PATH)).toBeNull();
  });
}

function describeDownloadError(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('throws VFSError for non-404 errors', async () => {
    ctx.bucket.download.mockResolvedValue({
      data: null,
      error: { message: DOWNLOAD_ERR_MSG, statusCode: SERVER_ERR_STATUS },
    });
    try {
      await ctx.storage.download(FILE_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

// ─── Delete ─────────────────────────────────────────────────────────────────

function describeDelete(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('calls bucket.remove with correct path array', async () => {
    await ctx.storage.delete(FILE_PATH);
    expect(ctx.bucket.remove).toHaveBeenCalledWith([fullPath(FILE_PATH)]);
  });

  it('throws VFSError on delete failure', async () => {
    ctx.bucket.remove.mockResolvedValue({ data: null, error: { message: REMOVE_ERR_MSG } });
    try {
      await ctx.storage.delete(FILE_PATH);
      expect(true).toBe(false);
    } catch (err) {
      assertProviderError(err);
    }
  });
}

// ─── Rename ─────────────────────────────────────────────────────────────────

function describeRename(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('calls copy then remove in order', async () => {
    await ctx.storage.rename(FILE_PATH, NEW_PATH);
    expect(ctx.bucket.copy).toHaveBeenCalledWith(fullPath(FILE_PATH), fullPath(NEW_PATH));
    expect(ctx.bucket.remove).toHaveBeenCalledWith([fullPath(FILE_PATH)]);
  });

  it('throws on copy failure and does NOT call remove', async () => {
    ctx.bucket.copy.mockResolvedValue({ data: null, error: { message: COPY_ERR_MSG } });
    await expect(ctx.storage.rename(FILE_PATH, NEW_PATH)).rejects.toThrow(VFSError);
    expect(ctx.bucket.remove).not.toHaveBeenCalled();
  });

  it('throws on delete failure after successful copy', async () => {
    ctx.bucket.remove.mockResolvedValue({ data: null, error: { message: DELETE_ERR_MSG } });
    await expect(ctx.storage.rename(FILE_PATH, NEW_PATH)).rejects.toThrow(VFSError);
    expect(ctx.bucket.copy).toHaveBeenCalled();
  });
}

// ─── Tree Index Delegates ───────────────────────────────────────────────────

function describeTreeIndex(): void {
  let ctx: StorageTestContext = createTestContext();
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('uploadTreeIndex delegates to upload with __tree_index.json', async () => {
    await ctx.storage.uploadTreeIndex(TREE_INDEX_DATA);
    expect(ctx.bucket.upload).toHaveBeenCalledWith(fullPath(TREE_INDEX_FILE), TREE_INDEX_DATA, {
      contentType: 'text/plain',
      upsert: true,
    });
  });

  it('downloadTreeIndex delegates to download with __tree_index.json', async () => {
    ctx.bucket.download.mockResolvedValue({ data: new Blob([TREE_INDEX_DATA]), error: null });
    const result = await ctx.storage.downloadTreeIndex();
    expect(ctx.bucket.download).toHaveBeenCalledWith(fullPath(TREE_INDEX_FILE));
    expect(result).toBe(TREE_INDEX_DATA);
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('StorageLayer', () => {
  describe('upload', describeUpload);
  describe('download', describeDownloadHappy);
  describe('download null data', describeDownloadNullData);
  describe('download not found', describeDownloadNotFound);
  describe('download error', describeDownloadError);
  describe('delete', describeDelete);
  describe('rename', describeRename);
  describe('tree index', describeTreeIndex);
});
