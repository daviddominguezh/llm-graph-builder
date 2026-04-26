export const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.gif',
  '.tiff',
  '.jpg',
  '.png',
  '.bmp',
  '.webp',
  '.html',
  '.docx',
  '.pptx',
  '.xlsx',
];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

export interface QueuedFile {
  id: string;
  file: File;
}

export function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}

export function isAccepted(file: File): boolean {
  return ACCEPTED_EXTENSIONS.includes(getExt(file.name));
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

function formatUnit(value: number, unit: string): string {
  if (value >= 10) return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(1)} ${unit}`;
}

export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return formatUnit(bytes / KB, 'KB');
  if (bytes < GB) return formatUnit(bytes / MB, 'MB');
  return formatUnit(bytes / GB, 'GB');
}

export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
