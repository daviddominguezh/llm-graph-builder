import { PDFDocument } from 'pdf-lib';

const IMAGE_MIME_PREFIX = 'image/';
const PNG_MIME = 'image/png';
const ORIGIN = 0;

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith(IMAGE_MIME_PREFIX);
}

export function derivePdfObjectPath(gcsObject: string): string {
  return `${gcsObject}.pdf`;
}

export async function imageBytesToPdfBytes(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const embedded = mimeType === PNG_MIME ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: ORIGIN, y: ORIGIN, width: embedded.width, height: embedded.height });
  return await pdf.save();
}
