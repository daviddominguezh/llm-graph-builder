import type { SourcedChunk } from './chunker.js';
import { extensionOf } from './localChunkUtils.js';
import { extractCsvChunks } from './localCsv.js';
import { extractJsonChunks } from './localJson.js';
import { extractTextChunks } from './localText.js';

export type LocalFormat = 'txt' | 'md' | 'csv' | 'json';

const FORMATS: ReadonlySet<string> = new Set(['txt', 'md', 'csv', 'json']);

function log(msg: string): void {
  process.stdout.write(`[ragLocal] ${msg}\n`);
}

export function isLocalExtractionFile(filename: string): boolean {
  return FORMATS.has(extensionOf(filename));
}

export async function extractLocalChunks(buffer: Buffer, filename: string): Promise<SourcedChunk[]> {
  const ext = extensionOf(filename);
  const tag = `filename=${filename} ext=${ext} bytes=${String(buffer.byteLength)}`;
  if (ext === 'csv') {
    log(`extractor=csv ${tag}`);
    return extractCsvChunks(buffer);
  }
  if (ext === 'json') {
    log(`extractor=json ${tag}`);
    return extractJsonChunks(buffer);
  }
  if (ext === 'md') {
    log(`extractor=markdown ${tag}`);
    return await extractTextChunks(buffer, true);
  }
  if (ext === 'txt') {
    log(`extractor=text ${tag}`);
    return await extractTextChunks(buffer, false);
  }
  throw new Error(`unsupported local extraction extension: ${ext}`);
}
