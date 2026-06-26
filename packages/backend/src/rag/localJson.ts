import type { SourcedChunk } from './chunker.js';
import { LOCAL_CHUNK_SIZE_TOKENS, LOCAL_MIN_CHARS, buildLocalChunk, countTokens } from './localChunkUtils.js';

const ZERO = 0;
const ONE = 1;
const JSON_INDENT = 2;

type Jv = unknown;
type ParseResult = { ok: true; value: Jv } | { ok: false };

function safeParse(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as Jv };
  } catch {
    return { ok: false };
  }
}

interface JsonConfig<T> {
  serializeOne: (item: T) => string;
  serializeMany: (items: T[]) => string;
}

interface ChunkState<T> {
  rows: SourcedChunk[];
  batch: T[];
  batchTokens: number;
  paragraph: number;
  offset: number;
}

function emitChunk<T>(state: ChunkState<T>, serializeMany: (items: T[]) => string): ChunkState<T> {
  if (state.batch.length === ZERO) return state;
  const content = serializeMany(state.batch).trim();
  if (content.length < LOCAL_MIN_CHARS) {
    return { ...state, batch: [], batchTokens: ZERO };
  }
  const chunk = buildLocalChunk({ content, paragraph: state.paragraph, offset: state.offset });
  return {
    rows: [...state.rows, chunk],
    batch: [],
    batchTokens: ZERO,
    paragraph: state.paragraph + ONE,
    offset: state.offset + content.length,
  };
}

function addItem<T>(state: ChunkState<T>, item: T, config: JsonConfig<T>): ChunkState<T> {
  const tokens = countTokens(config.serializeOne(item));
  const flushed =
    state.batchTokens + tokens > LOCAL_CHUNK_SIZE_TOKENS && state.batch.length > ZERO
      ? emitChunk(state, config.serializeMany)
      : state;
  return {
    ...flushed,
    batch: [...flushed.batch, item],
    batchTokens: flushed.batchTokens + tokens,
  };
}

function chunksFromItems<T>(items: readonly T[], config: JsonConfig<T>): SourcedChunk[] {
  const initial: ChunkState<T> = {
    rows: [],
    batch: [],
    batchTokens: ZERO,
    paragraph: ZERO,
    offset: ZERO,
  };
  const acc = items.reduce<ChunkState<T>>((s, item) => addItem(s, item, config), initial);
  return emitChunk(acc, config.serializeMany).rows;
}

function chunksFromArray(value: Jv[]): SourcedChunk[] {
  return chunksFromItems<Jv>(value, {
    serializeOne: (item) => JSON.stringify(item),
    serializeMany: (items) => JSON.stringify(items, null, JSON_INDENT),
  });
}

function chunksFromObject(value: Record<string, Jv>): SourcedChunk[] {
  return chunksFromItems<readonly [string, Jv]>(Object.entries(value), {
    serializeOne: ([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`,
    serializeMany: (items) => JSON.stringify(Object.fromEntries(items), null, JSON_INDENT),
  });
}

function isPlainObject(value: Jv): value is Record<string, Jv> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function makeSingleChunk(content: string): SourcedChunk | null {
  const trimmed = content.trim();
  if (trimmed.length < LOCAL_MIN_CHARS) return null;
  return buildLocalChunk({ content: trimmed, paragraph: ZERO, offset: ZERO });
}

export function extractJsonChunks(buffer: Buffer): SourcedChunk[] {
  const parsed = safeParse(buffer.toString('utf-8'));
  if (!parsed.ok) return [];
  const { value } = parsed;
  if (Array.isArray(value)) return chunksFromArray(value);
  if (isPlainObject(value)) return chunksFromObject(value);
  const single = makeSingleChunk(JSON.stringify(value));
  return single === null ? [] : [single];
}
