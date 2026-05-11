'use client';

interface FileTypeIconProps {
  mimeType: string;
  filename: string;
  className?: string;
}

type FileKind = 'pdf' | 'doc' | 'sheet' | 'slide' | 'html' | 'image' | 'unknown';

interface KindStyle {
  label: string;
  bg: string;
}

const STYLES: Record<FileKind, KindStyle> = {
  pdf: { label: 'PDF', bg: 'bg-red-600' },
  doc: { label: 'DOC', bg: 'bg-blue-600' },
  sheet: { label: 'XLS', bg: 'bg-emerald-600' },
  slide: { label: 'PPT', bg: 'bg-orange-600' },
  html: { label: 'HTML', bg: 'bg-violet-600' },
  image: { label: 'IMG', bg: 'bg-pink-500' },
  unknown: { label: 'FILE', bg: 'bg-slate-500' },
};

const EXTENSION_KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  ppt: 'slide',
  pptx: 'slide',
  html: 'html',
  htm: 'html',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
};

const MIME_KINDS: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.ms-excel': 'sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'application/vnd.ms-powerpoint': 'slide',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slide',
  'text/html': 'html',
};

function kindFromMime(mimeType: string): FileKind | null {
  const direct = MIME_KINDS[mimeType];
  if (direct !== undefined) return direct;
  if (mimeType.startsWith('image/')) return 'image';
  return null;
}

function kindFromExtension(filename: string): FileKind {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'unknown';
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_KINDS[ext] ?? 'unknown';
}

function resolveKind(mimeType: string, filename: string): FileKind {
  return kindFromMime(mimeType) ?? kindFromExtension(filename);
}

export function FileTypeIcon({ mimeType, filename, className }: FileTypeIconProps): React.JSX.Element {
  const { label, bg } = STYLES[resolveKind(mimeType, filename)];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold text-white ${bg} ${className ?? ''}`.trim()}
    >
      {label}
    </span>
  );
}
