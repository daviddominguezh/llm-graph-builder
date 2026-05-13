import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { SourcedChunk } from './chunker.js';
import { chunkTextWithSplitter } from './localText.js';

const FIRST_PAGE = 1;
const PAGE_SEPARATOR = '\n\n';

interface PdfTextItem {
  str?: unknown;
}

function itemToString(item: PdfTextItem): string {
  return typeof item.str === 'string' ? item.str : '';
}

interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown }> }>;
}

async function pageToText(doc: PdfDocLike, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = Array.isArray(content.items) ? content.items : [];
  return items.map((it: PdfTextItem) => itemToString(it)).join(' ');
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = (await getDocument(bytes).promise) as PdfDocLike;
  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + FIRST_PAGE);
  const pages = await Promise.all(pageNumbers.map(async (n) => await pageToText(doc, n)));
  return pages.join(PAGE_SEPARATOR);
}

export async function extractPdfChunks(bytes: Uint8Array): Promise<SourcedChunk[]> {
  const text = await extractPdfText(bytes);
  return await chunkTextWithSplitter(text, false);
}
