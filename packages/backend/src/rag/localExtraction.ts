import type { SourcedChunk } from './chunker.js';
import { extensionOf } from './localChunkUtils.js';
import { extractCsvChunks } from './localCsv.js';
import { extractJsonChunks } from './localJson.js';
import { extractTextChunks } from './localText.js';

export type LocalFormat = 'txt' | 'md' | 'csv' | 'json';

const FORMATS: ReadonlySet<string> = new Set(['txt', 'md', 'csv', 'json']);

export function isLocalExtractionFile(filename: string): boolean {
  return FORMATS.has(extensionOf(filename));
}

export async function extractLocalChunks(buffer: Buffer, filename: string): Promise<SourcedChunk[]> {
  const ext = extensionOf(filename);
  if (ext === 'csv') return extractCsvChunks(buffer);
  if (ext === 'json') return extractJsonChunks(buffer);
  if (ext === 'md') return await extractTextChunks(buffer, true);
  if (ext === 'txt') return await extractTextChunks(buffer, false);
  throw new Error(`unsupported local extraction extension: ${ext}`);
}
