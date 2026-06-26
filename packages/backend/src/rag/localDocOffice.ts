import { OfficeParser } from 'officeparser';

import type { SourcedChunk } from './chunker.js';
import { chunkTextWithSplitter } from './localText.js';

interface AstLike {
  toText: () => string;
}

function hasToText(value: unknown): value is AstLike {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { toText?: unknown }).toText === 'function';
}

export async function extractOfficeChunks(bytes: Buffer): Promise<SourcedChunk[]> {
  const ast = await OfficeParser.parseOffice(bytes);
  const text = hasToText(ast) ? ast.toText() : '';
  return await chunkTextWithSplitter(text, false);
}
