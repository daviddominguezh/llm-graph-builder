import TurndownService from 'turndown';

import type { SourcedChunk } from './chunker.js';
import { chunkTextWithSplitter } from './localText.js';

let cachedService: TurndownService | null = null;
function getService(): TurndownService {
  cachedService ??= new TurndownService();
  return cachedService;
}

export async function extractHtmlChunks(bytes: Buffer): Promise<SourcedChunk[]> {
  const html = bytes.toString('utf-8');
  const markdown = getService().turndown(html);
  return await chunkTextWithSplitter(markdown, true);
}
