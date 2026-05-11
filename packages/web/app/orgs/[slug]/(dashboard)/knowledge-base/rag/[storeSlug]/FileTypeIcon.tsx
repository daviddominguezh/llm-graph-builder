'use client';

interface FileTypeIconProps {
  mimeType: string;
  filename: string;
  className?: string;
}

type FileKind = 'pdf' | 'doc' | 'sheet' | 'slide' | 'html' | 'image' | 'unknown';

interface KindStyle {
  label: string;
  fill: string;
  paper: string;
  fold: string;
}

const STYLES: Record<FileKind, KindStyle> = {
  pdf:     { label: 'PDF',  fill: '#dc2626', paper: '#fef2f2', fold: '#fca5a5' },
  doc:     { label: 'DOC',  fill: '#2563eb', paper: '#eff6ff', fold: '#93c5fd' },
  sheet:   { label: 'XLS',  fill: '#16a34a', paper: '#f0fdf4', fold: '#86efac' },
  slide:   { label: 'PPT',  fill: '#ea580c', paper: '#fff7ed', fold: '#fdba74' },
  html:    { label: 'HTML', fill: '#7c3aed', paper: '#f5f3ff', fold: '#c4b5fd' },
  image:   { label: 'IMG',  fill: '#db2777', paper: '#fdf2f8', fold: '#f9a8d4' },
  unknown: { label: 'FILE', fill: '#64748b', paper: '#f8fafc', fold: '#cbd5e1' },
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
  const kind = resolveKind(mimeType, filename);
  const style = STYLES[kind];
  return (
    <svg
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className ?? ''}`.trim()}
      aria-hidden="true"
    >
      <path
        d="M2 2.5A2.5 2.5 0 0 1 4.5 0H16l6 6v23.5A2.5 2.5 0 0 1 19.5 32h-15A2.5 2.5 0 0 1 2 29.5V2.5Z"
        fill={style.paper}
        stroke={style.fold}
        strokeWidth="1"
      />
      <path d="M16 0v4a2 2 0 0 0 2 2h4l-6-6Z" fill={style.fold} />
      <rect x="2" y="18" width="20" height="8" rx="1.5" fill={style.fill} />
      <text
        x="12"
        y="24"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize="5.5"
        fill="#ffffff"
      >
        {style.label}
      </text>
    </svg>
  );
}
