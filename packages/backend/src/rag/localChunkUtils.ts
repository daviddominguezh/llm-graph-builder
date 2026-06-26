import { type Tiktoken, getEncoding } from 'js-tiktoken';
import { createHash } from 'node:crypto';

import type { SourcedChunk } from './chunker.js';

export const LOCAL_CHUNK_SIZE_TOKENS = 300;
export const LOCAL_CHUNK_OVERLAP_TOKENS = 50;
export const LOCAL_MIN_CHARS = 1;
const LOCAL_FIRST_PAGE = 1;
const MIN_TOKENS = 1;
const NO_DOT = -1;
const PAST_DOT = 1;

let cachedEncoding: Tiktoken | null = null;
function tokenizer(): Tiktoken {
  cachedEncoding ??= getEncoding('cl100k_base');
  return cachedEncoding;
}

export function countTokens(text: string): number {
  return Math.max(MIN_TOKENS, tokenizer().encode(text).length);
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface LocalChunkInput {
  content: string;
  paragraph: number;
  offset: number;
}

export function buildLocalChunk(input: LocalChunkInput): SourcedChunk {
  return {
    content: input.content,
    content_hash: hashContent(input.content),
    token_count: countTokens(input.content),
    page_number: LOCAL_FIRST_PAGE,
    page_end: LOCAL_FIRST_PAGE,
    paragraph_idx: input.paragraph,
    char_start: input.offset,
    char_end: input.offset + input.content.length,
  };
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === NO_DOT) return '';
  return filename.slice(dot + PAST_DOT).toLowerCase();
}
