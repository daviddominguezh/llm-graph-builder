import {
  type StorageBucketApi,
  type StorageFileObject,
  type SupabaseVFSClient,
  VFSError,
  VFSErrorCode,
} from './types.js';

const BUCKET = 'vfs';
const TREE_INDEX_FILE = '__tree_index.json';
const LIST_PAGE_SIZE = 100;
const INITIAL_OFFSET = 0;

function isNotFound(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === '404' || error.message.includes('not found');
}

function wrapStorageError(error: { message: string }, operation: string, path: string): VFSError {
  return new VFSError(
    VFSErrorCode.PROVIDER_ERROR,
    `Storage ${operation} failed for ${path}: ${error.message}`
  );
}

export class StorageLayer {
  private readonly bucket: StorageBucketApi;
  private readonly prefix: string;

  constructor(supabase: SupabaseVFSClient, sessionPrefix: string) {
    this.bucket = supabase.storage.from(BUCKET);
    this.prefix = sessionPrefix;
  }

  async upload(path: string, content: string): Promise<void> {
    const { error } = await this.bucket.upload(this.fullPath(path), content, {
      contentType: 'text/plain',
      upsert: true,
    });
    if (error !== null) throw wrapStorageError(error, 'upload', path);
  }

  async download(path: string): Promise<string | null> {
    const { data, error } = await this.bucket.download(this.fullPath(path));
    if (error !== null) {
      if (isNotFound(error)) return null;
      throw wrapStorageError(error, 'download', path);
    }
    if (data === null) return null;
    return await data.text();
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.bucket.remove([this.fullPath(path)]);
    if (error !== null) throw wrapStorageError(error, 'delete', path);
  }

  // copy-then-delete — not atomic
  async rename(oldPath: string, newPath: string): Promise<void> {
    const { error: copyErr } = await this.bucket.copy(this.fullPath(oldPath), this.fullPath(newPath));
    if (copyErr !== null) throw wrapStorageError(copyErr, 'rename (copy)', oldPath);
    const { error: delErr } = await this.bucket.remove([this.fullPath(oldPath)]);
    if (delErr !== null) throw wrapStorageError(delErr, 'rename (delete)', oldPath);
  }

  async uploadTreeIndex(data: string): Promise<void> {
    await this.upload(TREE_INDEX_FILE, data);
  }

  async downloadTreeIndex(): Promise<string | null> {
    return await this.download(TREE_INDEX_FILE);
  }

  async deleteAll(): Promise<void> {
    const allPaths = await this.listAllPaths(this.prefix);
    const batches = chunkArray(allPaths, LIST_PAGE_SIZE);
    await Promise.all(
      batches.map(async (batch) => {
        await this.deleteBatch(batch);
      })
    );
  }

  private async deleteBatch(paths: string[]): Promise<void> {
    const { error } = await this.bucket.remove(paths);
    if (error !== null) throw wrapStorageError(error, 'deleteAll', this.prefix);
  }

  private fullPath(path: string): string {
    return `${this.prefix}/${path}`;
  }

  private async listAllPaths(prefix: string): Promise<string[]> {
    return await listAllRecursive(this.bucket, prefix, INITIAL_OFFSET);
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = INITIAL_OFFSET; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function resolveItems(
  bucket: StorageBucketApi,
  items: StorageFileObject[],
  prefix: string
): Promise<string[]> {
  const results = await Promise.all(
    items.map(async (item) => {
      const fullPath = `${prefix}/${item.name}`;
      if (item.id === null) return await listAllRecursive(bucket, fullPath, INITIAL_OFFSET);
      return [fullPath];
    })
  );
  return results.flat();
}

async function listAllRecursive(bucket: StorageBucketApi, prefix: string, offset: number): Promise<string[]> {
  const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE_SIZE, offset });
  if (error !== null) throw wrapStorageError(error, 'list', prefix);
  if (data === null || data.length === INITIAL_OFFSET) return [];
  const pagePaths = await resolveItems(bucket, data, prefix);
  if (data.length < LIST_PAGE_SIZE) return pagePaths;
  const nextPaths = await listAllRecursive(bucket, prefix, offset + LIST_PAGE_SIZE);
  return [...pagePaths, ...nextPaths];
}
