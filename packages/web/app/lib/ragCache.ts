import { type IDBPDatabase, openDB } from 'idb';

import type { RagChunkRow, RagFileRow, TenantUsage } from './ragFiles';

const DB_NAME = 'openflow-rag-cache';
const DB_VERSION = 1;
const FILES_STORE = 'files';
const CHUNKS_STORE = 'chunks';
const CHUNKS_INDEX = 'by_file_id';

interface FilesEntry {
  files: RagFileRow[];
  usage: TenantUsage;
  digest: string;
  cachedAt: number;
}

interface ChunksEntry {
  rows: RagChunkRow[];
  fileId: string;
  cachedAt: number;
}

let cachedDbPromise: Promise<IDBPDatabase> | null = null;

function ensureBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function getDb(): Promise<IDBPDatabase> {
  cachedDbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE);
      }
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE);
        store.createIndex(CHUNKS_INDEX, 'fileId', { unique: false });
      }
    },
  });
  return cachedDbPromise;
}

function filesKey(storeId: string, tenantId: string): string {
  return `${storeId}::${tenantId}`;
}

function chunksKey(fileId: string, page: number): string {
  return `${fileId}::${String(page)}`;
}

export async function getCachedFiles(
  storeId: string,
  tenantId: string
): Promise<FilesEntry | null> {
  if (!ensureBrowser()) return null;
  try {
    const db = await getDb();
    const value = (await db.get(FILES_STORE, filesKey(storeId, tenantId))) as
      | FilesEntry
      | undefined;
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setCachedFiles(
  storeId: string,
  tenantId: string,
  files: RagFileRow[],
  usage: TenantUsage,
  digest: string
): Promise<void> {
  if (!ensureBrowser()) return;
  try {
    const db = await getDb();
    const entry: FilesEntry = { files, usage, digest, cachedAt: Date.now() };
    await db.put(FILES_STORE, entry, filesKey(storeId, tenantId));
  } catch {
    // best-effort
  }
}

export async function invalidateFiles(storeId: string, tenantId: string): Promise<void> {
  if (!ensureBrowser()) return;
  try {
    const db = await getDb();
    await db.delete(FILES_STORE, filesKey(storeId, tenantId));
  } catch {
    // best-effort
  }
}

export async function getCachedChunks(fileId: string, page: number): Promise<RagChunkRow[] | null> {
  if (!ensureBrowser()) return null;
  try {
    const db = await getDb();
    const value = (await db.get(CHUNKS_STORE, chunksKey(fileId, page))) as
      | ChunksEntry
      | undefined;
    return value === undefined ? null : value.rows;
  } catch {
    return null;
  }
}

export async function setCachedChunks(
  fileId: string,
  page: number,
  rows: RagChunkRow[]
): Promise<void> {
  if (!ensureBrowser()) return;
  try {
    const db = await getDb();
    const entry: ChunksEntry = { rows, fileId, cachedAt: Date.now() };
    await db.put(CHUNKS_STORE, entry, chunksKey(fileId, page));
  } catch {
    // best-effort
  }
}

export async function invalidateChunksForFile(fileId: string): Promise<void> {
  if (!ensureBrowser()) return;
  try {
    const db = await getDb();
    const tx = db.transaction(CHUNKS_STORE, 'readwrite');
    const index = tx.store.index(CHUNKS_INDEX);
    let cursor = await index.openKeyCursor(IDBKeyRange.only(fileId));
    while (cursor !== null) {
      await tx.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch {
    // best-effort
  }
}
