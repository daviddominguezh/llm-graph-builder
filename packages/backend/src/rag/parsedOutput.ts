import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { DocumentAiPayload, SourcedChunk } from './chunker.js';
import { listObjectsUnder, readBytesObject } from './gcs.js';

const JSON_EXT = '.json';
const DUMP_ROOT_SEGMENTS = ['tmp', 'document-ai-raw'];
const FINAL_CHUNKS_FILENAME = 'final-chunks.json';
const JSON_INDENT = 2;
const EMPTY = 0;

export interface ShardData {
  objectPath: string;
  bytes: Uint8Array;
}

function isDocumentAiPayload(v: unknown): v is DocumentAiPayload {
  return typeof v === 'object' && v !== null;
}

export async function fetchAllShards(prefix: string): Promise<ShardData[]> {
  const objects = await listObjectsUnder(prefix);
  const jsonObjects = objects.filter((obj) => obj.endsWith(JSON_EXT));
  return await jsonObjects.reduce<Promise<ShardData[]>>(async (prev, obj) => {
    const acc = await prev;
    const bytes = await readBytesObject(obj);
    acc.push({ objectPath: obj, bytes });
    return acc;
  }, Promise.resolve([]));
}

function parseShard(bytes: Uint8Array): DocumentAiPayload | null {
  const text = Buffer.from(bytes).toString('utf8');
  const payload: unknown = JSON.parse(text);
  return isDocumentAiPayload(payload) ? payload : null;
}

export function mergePayloads(shards: ShardData[]): DocumentAiPayload {
  const merged: DocumentAiPayload = { chunkedDocument: { chunks: [] } };
  for (const shard of shards) {
    const payload = parseShard(shard.bytes);
    if (payload === null) continue;
    const chunks = payload.chunkedDocument?.chunks ?? [];
    merged.chunkedDocument?.chunks?.push(...chunks);
  }
  return merged;
}

function dumpDir(fileId: string): string {
  return join(process.cwd(), ...DUMP_ROOT_SEGMENTS, fileId);
}

async function dumpShardToDisk(destDir: string, shard: ShardData): Promise<void> {
  await writeFile(join(destDir, basename(shard.objectPath)), Buffer.from(shard.bytes));
}

async function dumpShardsToDisk(fileId: string, shards: ShardData[]): Promise<void> {
  if (shards.length === EMPTY) return;
  const destDir = dumpDir(fileId);
  await mkdir(destDir, { recursive: true });
  await shards.reduce<Promise<void>>(async (prev, shard) => {
    await prev;
    await dumpShardToDisk(destDir, shard);
  }, Promise.resolve());
}

export async function safeDumpShardsToDisk(
  fileId: string,
  shards: ShardData[],
  log: (msg: string) => void
): Promise<void> {
  try {
    await dumpShardsToDisk(fileId, shards);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`raw dump failed for ${fileId}: ${msg}`);
  }
}

async function dumpFinalChunksToDisk(fileId: string, chunks: SourcedChunk[]): Promise<void> {
  if (chunks.length === EMPTY) return;
  const destDir = dumpDir(fileId);
  await mkdir(destDir, { recursive: true });
  const payload = JSON.stringify(chunks, null, JSON_INDENT);
  await writeFile(join(destDir, FINAL_CHUNKS_FILENAME), payload);
}

export async function safeDumpFinalChunks(
  fileId: string,
  chunks: SourcedChunk[],
  log: (msg: string) => void
): Promise<void> {
  try {
    await dumpFinalChunksToDisk(fileId, chunks);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`final-chunks dump failed for ${fileId}: ${msg}`);
  }
}
