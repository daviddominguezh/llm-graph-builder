import type { SourcedChunk } from './chunker.js';
import { extensionOf } from './localChunkUtils.js';
import { extractHtmlChunks } from './localDocHtml.js';
import { extractOfficeChunks } from './localDocOffice.js';
import { extractPdfChunks } from './localDocPdf.js';

const OFFICE_EXTS: ReadonlySet<string> = new Set(['docx', 'pptx', 'xlsx']);

function isPdf(ext: string, mimeType: string): boolean {
  return ext === 'pdf' || mimeType === 'application/pdf';
}

function isHtml(ext: string, mimeType: string): boolean {
  return ext === 'html' || ext === 'htm' || mimeType === 'text/html';
}

export function isLocalDocFile(filename: string, mimeType: string): boolean {
  const ext = extensionOf(filename);
  return isPdf(ext, mimeType) || isHtml(ext, mimeType) || OFFICE_EXTS.has(ext);
}

export async function extractLocalDocChunks(
  bytes: Buffer,
  filename: string,
  mimeType: string
): Promise<SourcedChunk[]> {
  const ext = extensionOf(filename);
  if (isPdf(ext, mimeType)) return await extractPdfChunks(new Uint8Array(bytes));
  if (isHtml(ext, mimeType)) return await extractHtmlChunks(bytes);
  if (OFFICE_EXTS.has(ext)) return await extractOfficeChunks(bytes);
  throw new Error(`unsupported local doc extension: ${ext} (mime: ${mimeType})`);
}
