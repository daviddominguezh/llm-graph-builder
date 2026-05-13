import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import type { SourcedChunk } from './chunker.js';
import {
  LOCAL_CHUNK_OVERLAP_TOKENS,
  LOCAL_CHUNK_SIZE_TOKENS,
  LOCAL_MIN_CHARS,
  buildLocalChunk,
  countTokens,
} from './localChunkUtils.js';

const ZERO = 0;
const ONE = 1;

interface SplitterOpts {
  markdown: boolean;
}

function makeSplitter(opts: SplitterOpts): RecursiveCharacterTextSplitter {
  const params = {
    chunkSize: LOCAL_CHUNK_SIZE_TOKENS,
    chunkOverlap: LOCAL_CHUNK_OVERLAP_TOKENS,
    lengthFunction: (text: string) => countTokens(text),
  };
  return opts.markdown ? new MarkdownTextSplitter(params) : new RecursiveCharacterTextSplitter(params);
}

interface SliceLoc {
  content: string;
  offset: number;
}

function locateSlices(text: string, pieces: readonly string[]): SliceLoc[] {
  const out: SliceLoc[] = [];
  let searchFrom = ZERO;
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (trimmed.length === ZERO) continue;
    const idx = text.indexOf(trimmed, searchFrom);
    if (idx < ZERO) continue;
    out.push({ content: trimmed, offset: idx });
    searchFrom = idx + ONE;
  }
  return out;
}

export async function chunkTextWithSplitter(text: string, markdown: boolean): Promise<SourcedChunk[]> {
  if (text.trim().length < LOCAL_MIN_CHARS) return [];
  const splitter = makeSplitter({ markdown });
  const pieces = await splitter.splitText(text);
  const slices = locateSlices(text, pieces);
  return slices.map((s, idx) => buildLocalChunk({ content: s.content, paragraph: idx, offset: s.offset }));
}

export async function extractTextChunks(buffer: Buffer, markdown: boolean): Promise<SourcedChunk[]> {
  return await chunkTextWithSplitter(buffer.toString('utf-8'), markdown);
}
