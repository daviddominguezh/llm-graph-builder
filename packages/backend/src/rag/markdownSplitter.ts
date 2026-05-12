import { MarkdownTextSplitter } from '@langchain/textsplitters';
import { type Tiktoken, getEncoding } from 'js-tiktoken';
import { createHash } from 'node:crypto';

import type { DocumentAiPayload, SourcedChunk } from './chunker.js';

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

interface SourceMeta {
  pageStart: number;
  pageEnd: number;
}

interface SourceWithMeta {
  text: string;
  meta: SourceMeta;
}

function extractSources(payload: DocumentAiPayload): SourceWithMeta[] {
  const chunks = payload.chunkedDocument?.chunks ?? [];
  const out: SourceWithMeta[] = [];
  for (const c of chunks) {
    const text = (c.content ?? '').trim();
    if (text.length === ZERO) continue;
    const pageStart = c.pageSpan?.pageStart ?? FIRST_PAGE;
    const pageEnd = c.pageSpan?.pageEnd ?? pageStart;
    out.push({ text, meta: { pageStart, pageEnd } });
  }
  return out;
}

function readMeta(metadata: Record<string, unknown>): SourceMeta {
  const pageStart = typeof metadata.pageStart === 'number' ? metadata.pageStart : FIRST_PAGE;
  const pageEnd = typeof metadata.pageEnd === 'number' ? metadata.pageEnd : pageStart;
  return { pageStart, pageEnd };
}

interface RowInput {
  content: string;
  meta: SourceMeta;
  paragraph: number;
  runningOffset: number;
}

function buildChunk(input: RowInput): SourcedChunk {
  return {
    content: input.content,
    content_hash: hashContent(input.content),
    token_count: tokenEstimate(input.content),
    page_number: input.meta.pageStart,
    page_end: input.meta.pageEnd,
    paragraph_idx: input.paragraph,
    char_start: input.runningOffset,
    char_end: input.runningOffset + input.content.length,
  };
}

function makeSplitter(): MarkdownTextSplitter {
  const enc = tokenizer();
  return new MarkdownTextSplitter({
    chunkSize: CHUNK_SIZE_TOKENS,
    chunkOverlap: CHUNK_OVERLAP_TOKENS,
    lengthFunction: (text) => enc.encode(text).length,
  });
}

interface AccumulatedRows {
  rows: SourcedChunk[];
  pageCounter: Map<number, number>;
  offset: number;
}

function appendRow(acc: AccumulatedRows, content: string, meta: SourceMeta): AccumulatedRows {
  const paragraph = acc.pageCounter.get(meta.pageStart) ?? ZERO;
  const nextCounter = new Map(acc.pageCounter);
  nextCounter.set(meta.pageStart, paragraph + ONE);
  const chunk = buildChunk({ content, meta, paragraph, runningOffset: acc.offset });
  return {
    rows: [...acc.rows, chunk],
    pageCounter: nextCounter,
    offset: acc.offset + content.length,
  };
}

interface SplitterDoc {
  pageContent: string;
  metadata: Record<string, unknown>;
}

function foldDocs(docs: readonly SplitterDoc[]): SourcedChunk[] {
  const initial: AccumulatedRows = { rows: [], pageCounter: new Map(), offset: ZERO };
  const final = docs.reduce<AccumulatedRows>((acc, doc) => {
    const content = doc.pageContent.trim();
    if (content.length < MIN_CHARS) return acc;
    return appendRow(acc, content, readMeta(doc.metadata));
  }, initial);
  return final.rows;
}

export async function splitMarkdownChunks(payload: DocumentAiPayload): Promise<SourcedChunk[]> {
  const sources = extractSources(payload);
  if (sources.length === ZERO) return [];
  const splitter = makeSplitter();
  const docs = await splitter.createDocuments(
    sources.map((s) => s.text),
    sources.map((s) => s.meta)
  );
  return foldDocs(docs);
}
