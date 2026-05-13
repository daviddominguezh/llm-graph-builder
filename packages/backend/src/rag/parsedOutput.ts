import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { DocumentAiPayload, SourcedChunk } from './chunker.js';
import { listObjectsUnder, readBytesObject } from './gcs.js';

const JSON_EXT = '.json';
const DUMP_ROOT_SEGMENTS = ['tmp', 'document-ai-raw'];
const FINAL_CHUNKS_FILENAME = 'final-chunks.json';
const JSON_INDENT = 2;
const EMPTY = 0;
const FIRST_PAGE = 1;
const DEFAULT_SHARD_INDEX = 0;

export interface ShardData {
  objectPath: string;
  bytes: Uint8Array;
}

export interface OcrPageRange {
  pageNumber: number;
  start: number;
  end: number;
}

export interface OcrPayload {
  text: string;
  pages: OcrPageRange[];
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

interface SegmentRaw {
  startIndex?: unknown;
  endIndex?: unknown;
}

function segmentBounds(segments: unknown): { start: number; end: number } | null {
  if (!Array.isArray(segments)) return null;
  let minStart = Infinity;
  let maxEnd = EMPTY;
  for (const seg of segments) {
    if (!isRecord(seg)) continue;
    const raw = seg as SegmentRaw;
    const s = toNumber(raw.startIndex) ?? EMPTY;
    const e = toNumber(raw.endIndex) ?? EMPTY;
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }
  if (!Number.isFinite(minStart)) return null;
  return { start: minStart, end: maxEnd };
}

function pageRangeFromRaw(page: Record<string, unknown>): OcrPageRange | null {
  const pageNumber = toNumber(page.pageNumber) ?? FIRST_PAGE;
  const layout = isRecord(page.layout) ? page.layout : {};
  const textAnchor = isRecord(layout.textAnchor) ? layout.textAnchor : {};
  const bounds = segmentBounds(textAnchor.textSegments);
  if (bounds === null) return null;
  return { pageNumber, start: bounds.start, end: bounds.end };
}

function parsePages(pagesRaw: unknown): OcrPageRange[] {
  if (!Array.isArray(pagesRaw)) return [];
  const out: OcrPageRange[] = [];
  for (const p of pagesRaw) {
    if (!isRecord(p)) continue;
    const range = pageRangeFromRaw(p);
    if (range !== null) out.push(range);
  }
  return out;
}

interface ShardParsed {
  text: string;
  pages: OcrPageRange[];
  shardIndex: number;
}

function parseShard(bytes: Uint8Array): ShardParsed | null {
  const text = Buffer.from(bytes).toString('utf8');
  const payload: unknown = JSON.parse(text);
  if (!isRecord(payload)) return null;
  const docText = typeof payload.text === 'string' ? payload.text : '';
  const pages = parsePages(payload.pages);
  const shardInfo = isRecord(payload.shardInfo) ? payload.shardInfo : {};
  const shardIndex = toNumber(shardInfo.shardIndex) ?? DEFAULT_SHARD_INDEX;
  return { text: docText, pages, shardIndex };
}

interface MergeAcc {
  text: string;
  pages: OcrPageRange[];
}

function appendShard(acc: MergeAcc, sp: ShardParsed): MergeAcc {
  const { text } = acc;
  const { length: offset } = text;
  const shiftedPages = sp.pages.map((p) => ({
    pageNumber: p.pageNumber,
    start: offset + p.start,
    end: offset + p.end,
  }));
  return { text: text + sp.text, pages: [...acc.pages, ...shiftedPages] };
}

export function mergeOcrPayload(shards: ShardData[]): OcrPayload {
  const parsed: ShardParsed[] = [];
  for (const s of shards) {
    const p = parseShard(s.bytes);
    if (p !== null) parsed.push(p);
  }
  parsed.sort((a, b) => a.shardIndex - b.shardIndex);
  return parsed.reduce<MergeAcc>(appendShard, { text: '', pages: [] });
}

function isLayoutPayloadShape(v: unknown): v is DocumentAiPayload {
  return typeof v === 'object' && v !== null;
}

export function mergeLayoutPayload(shards: ShardData[]): DocumentAiPayload {
  const merged: DocumentAiPayload = { chunkedDocument: { chunks: [] } };
  for (const shard of shards) {
    const decoded = Buffer.from(shard.bytes).toString('utf8');
    const payload: unknown = JSON.parse(decoded);
    if (!isLayoutPayloadShape(payload)) continue;
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
