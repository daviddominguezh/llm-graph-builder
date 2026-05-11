import { createHash } from 'node:crypto';

const DEFAULT_MIN_CHARS = 30;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const FIRST_PAGE = 1;
const ZERO = 0;
const PARA_INCREMENT = 1;
const MIN_TOKENS = 1;

export interface DocumentAiChunk {
  chunkId?: string;
  content?: string;
  pageSpan?: {
    pageStart?: number;
    pageEnd?: number;
  };
}

export interface DocumentAiPayload {
  chunkedDocument?: {
    chunks?: DocumentAiChunk[];
  };
}

export interface SourcedChunk {
  content: string;
  content_hash: string;
  token_count: number;
  page_number: number;
  paragraph_idx: number;
  char_start: number;
  char_end: number;
}

export interface NormalizeOptions {
  minChars: number;
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function tokenEstimate(text: string): number {
  return Math.max(MIN_TOKENS, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}

interface PageState {
  paragraph: number;
}

function buildSourcedChunk(
  content: string,
  page: number,
  paragraph: number,
  runningOffset: number
): SourcedChunk {
  return {
    content,
    content_hash: hashContent(content),
    token_count: tokenEstimate(content),
    page_number: page,
    paragraph_idx: paragraph,
    char_start: runningOffset,
    char_end: runningOffset + content.length,
  };
}

function nextParagraph(pageState: Map<number, PageState>, page: number): number {
  const state = pageState.get(page) ?? { paragraph: ZERO };
  return state.paragraph;
}

interface BuildResult {
  chunk: SourcedChunk | null;
  consumed: number;
}

function buildOrSkip(raw: DocumentAiChunk, minChars: number, offset: number, paragraph: number): BuildResult {
  const trimmed = (raw.content ?? '').trim();
  if (trimmed.length < minChars) {
    return { chunk: null, consumed: (raw.content ?? '').length };
  }
  const page = raw.pageSpan?.pageStart ?? FIRST_PAGE;
  return { chunk: buildSourcedChunk(trimmed, page, paragraph, offset), consumed: trimmed.length };
}

export function normalizeChunks(
  payload: DocumentAiPayload,
  options: NormalizeOptions = { minChars: DEFAULT_MIN_CHARS }
): SourcedChunk[] {
  const chunks = payload.chunkedDocument?.chunks ?? [];
  const out: SourcedChunk[] = [];
  const pageState = new Map<number, PageState>();
  let runningOffset = ZERO;
  for (const raw of chunks) {
    const page = raw.pageSpan?.pageStart ?? FIRST_PAGE;
    const paragraph = nextParagraph(pageState, page);
    const { chunk, consumed } = buildOrSkip(raw, options.minChars, runningOffset, paragraph);
    runningOffset += consumed;
    if (chunk !== null) {
      out.push(chunk);
      pageState.set(page, { paragraph: paragraph + PARA_INCREMENT });
    }
  }
  return out;
}

export function maxPage(chunks: SourcedChunk[]): number {
  const pages = chunks.map((c) => c.page_number);
  return pages.length === ZERO ? ZERO : Math.max(...pages);
}
