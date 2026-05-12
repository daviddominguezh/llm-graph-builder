import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { type Tiktoken, getEncoding } from 'js-tiktoken';
import { createHash } from 'node:crypto';

import type { SourcedChunk } from './chunker.js';
import type { OcrPageRange, OcrPayload } from './parsedOutput.js';

const CHUNK_SIZE_TOKENS = 300;
const CHUNK_OVERLAP_TOKENS = 50;
const MIN_CHARS = 30;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const FIRST_PAGE = 1;
const ZERO = 0;
const ONE = 1;
const MIN_TOKENS = 1;

let cachedEncoding: Tiktoken | null = null;
function tokenizer(): Tiktoken {
  cachedEncoding ??= getEncoding('cl100k_base');
  return cachedEncoding;
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function tokenEstimate(text: string): number {
  return Math.max(MIN_TOKENS, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}

function makeSplitter(): RecursiveCharacterTextSplitter {
  const enc = tokenizer();
  return new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE_TOKENS,
    chunkOverlap: CHUNK_OVERLAP_TOKENS,
    lengthFunction: (text) => enc.encode(text).length,
  });
}

interface ChunkSlice {
  content: string;
  start: number;
  end: number;
}

function locateSlices(text: string, pieces: string[]): ChunkSlice[] {
  const out: ChunkSlice[] = [];
  let searchFrom = ZERO;
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (trimmed.length === ZERO) continue;
    const idx = text.indexOf(trimmed, searchFrom);
    if (idx < ZERO) continue;
    out.push({ content: trimmed, start: idx, end: idx + trimmed.length });
    searchFrom = idx + ONE;
  }
  return out;
}

function pageAtOffset(pages: OcrPageRange[], offset: number): number {
  for (const p of pages) {
    if (offset >= p.start && offset < p.end) return p.pageNumber;
  }
  return pages[ZERO]?.pageNumber ?? FIRST_PAGE;
}

interface PageBounds {
  pageStart: number;
  pageEnd: number;
}

function pageBounds(pages: OcrPageRange[], start: number, end: number): PageBounds {
  const pageStart = pageAtOffset(pages, start);
  const pageEnd = pageAtOffset(pages, Math.max(start, end - ONE));
  return { pageStart, pageEnd };
}

interface Accumulator {
  rows: SourcedChunk[];
  pageCounter: Map<number, number>;
}

function buildChunkFromSlice(slice: ChunkSlice, bounds: PageBounds, paragraph: number): SourcedChunk {
  return {
    content: slice.content,
    content_hash: hashContent(slice.content),
    token_count: tokenEstimate(slice.content),
    page_number: bounds.pageStart,
    page_end: bounds.pageEnd,
    paragraph_idx: paragraph,
    char_start: slice.start,
    char_end: slice.end,
  };
}

function appendRow(acc: Accumulator, slice: ChunkSlice, pages: OcrPageRange[]): Accumulator {
  if (slice.content.length < MIN_CHARS) return acc;
  const bounds = pageBounds(pages, slice.start, slice.end);
  const paragraph = acc.pageCounter.get(bounds.pageStart) ?? ZERO;
  const nextCounter = new Map(acc.pageCounter);
  nextCounter.set(bounds.pageStart, paragraph + ONE);
  const chunk = buildChunkFromSlice(slice, bounds, paragraph);
  return { rows: [...acc.rows, chunk], pageCounter: nextCounter };
}

export async function splitOcrChunks(payload: OcrPayload): Promise<SourcedChunk[]> {
  if (payload.text.length === ZERO || payload.pages.length === ZERO) return [];
  const splitter = makeSplitter();
  const pieces = await splitter.splitText(payload.text);
  const slices = locateSlices(payload.text, pieces);
  const initial: Accumulator = { rows: [], pageCounter: new Map() };
  const final = slices.reduce<Accumulator>((acc, slice) => appendRow(acc, slice, payload.pages), initial);
  return final.rows;
}
