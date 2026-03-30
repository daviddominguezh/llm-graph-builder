import { type StorageBucketApi, type SupabaseVFSClient, VFSError, VFSErrorCode } from './types.js';

const BUCKET = 'vfs';
const TREE_INDEX_FILE = '__tree_index.json';
const LIST_PAGE_SIZE = 100;

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
    return data !== null ? await data.text() : null;
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
    return this.upload(TREE_INDEX_FILE, data);
  }

  async downloadTreeIndex(): Promise<string | null> {
    return this.download(TREE_INDEX_FILE);
  }

  async deleteAll(): Promise<void> {
    const allPaths = await this.listAllRecursive(this.prefix);
    for (let i = 0; i < allPaths.length; i += LIST_PAGE_SIZE) {
      const batch = allPaths.slice(i, i + LIST_PAGE_SIZE);
      await this.deleteBatch(batch);
    }
  }

  private async deleteBatch(paths: string[]): Promise<void> {
    const { error } = await this.bucket.remove(paths);
    if (error !== null) throw wrapStorageError(error, 'deleteAll', this.prefix);
  }

  private fullPath(path: string): string {
    return `${this.prefix}/${path}`;
  }

  private async processListItems(
    items: { name: string; id: string | null }[],
    prefix: string
  ): Promise<string[]> {
    const paths: string[] = [];
    for (const item of items) {
      const fullPath = `${prefix}/${item.name}`;
      if (item.id === null) {
        const nested = await this.listAllRecursive(fullPath);
        paths.push(...nested);
      } else {
        paths.push(fullPath);
      }
    }
    return paths;
  }

  private async listAllRecursive(prefix: string): Promise<string[]> {
    const paths: string[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await this.bucket.list(prefix, { limit: LIST_PAGE_SIZE, offset });
      if (error !== null) throw wrapStorageError(error, 'list', prefix);
      if (data === null || data.length === 0) break;
      const pagePaths = await this.processListItems(data, prefix);
      paths.push(...pagePaths);
      hasMore = data.length === LIST_PAGE_SIZE;
      offset += LIST_PAGE_SIZE;
    }
    return paths;
  }
}
